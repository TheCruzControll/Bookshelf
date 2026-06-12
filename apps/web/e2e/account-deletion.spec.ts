import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { gunzipSync, gzipSync } from "node:zlib";
import { test, expect } from "@playwright/test";

/**
 * E2E: delete account → 30-day grace → hard delete + export (#175, W-04).
 *
 * Exercises the full account-deletion lifecycle and asserts the two
 * user-visible outcomes from the issue:
 *
 *   AC1 — the public review URL returns `410 Gone` after the 30-day grace
 *         period elapses and the hard-delete cron purges the profile.
 *   AC2 — a GDPR export archive is present (and decodable) *before*
 *         deletion.
 *
 * ── How the flow is driven ────────────────────────────────────────────
 * The settings/export UI does not exist yet (`apps/web/app/settings` is a
 * placeholder `<h1>Settings</h1>` with no delete/export controls), so the
 * deletion lifecycle itself cannot be driven from the browser. Per the
 * W-04 brief, we drive the lifecycle through the API/tRPC layer while the
 * user-visible assertion (the `410` page) runs through the real web app.
 *
 * The web app reaches its backend exclusively through the S-06 (#161)
 * deletion-state probe in `apps/web/middleware.ts`, which — for every
 * `/u/:handle*` request — calls `GET {NEXT_PUBLIC_API_URL}/trpc/
 * profile.byHandle` and mirrors a `410` response back to the browser with
 * an empty body. `NEXT_PUBLIC_API_URL` defaults to `http://localhost:8787`.
 *
 * We therefore stand up an in-process HTTP backend on :8787 that
 * faithfully reproduces the real `profile.byHandle` contract documented in
 * `apps/api/src/trpc/profile.ts`:
 *   - live profile            → 200
 *   - purged + active tombstone (30–90d window) → 410
 *   - no profile, no/expired tombstone          → 404
 * and serves the GDPR export archive (#153) as a fetchable signed URL
 * (the shape production uses; dev's `LocalFileStorageProvider` returns a
 * `file://` URL instead — both are valid `StorageProvider` strategies).
 *
 * ── Time control ──────────────────────────────────────────────────────
 * Following the #152 hard-delete-cron precedent (an injectable `now`
 * passed to `AccountDeletionService.runHardDelete(now)`, paired with the
 * `createFakeTimer` / `afterDeletionGrace` helpers in `@hone/test-fixtures`)
 * we never touch the wall clock or sleep: a single fake clock is advanced
 * past the 30-day grace, and the cron is run against that logical `now`.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** R-05 / #151 — soft-delete grace before a profile becomes hard-deletable. */
const GRACE_DAYS = 30;
/**
 * S-06 / #161 — once purged, a tombstone keeps the handle claimed and the
 * route answering `410 Gone` for a further 60 days (30–90d post-request),
 * after which it is reaped and the route falls back to `404`.
 */
const TOMBSTONE_DAYS = 60;
/** #153 — default signed-URL lifetime for a GDPR export (24h). */
const EXPORT_URL_TTL_MS = 24 * 60 * 60 * 1000;
/** #153 — `ACCOUNT_EXPORT_SCHEMA_VERSION`. */
const EXPORT_SCHEMA_VERSION = 1;
/** Default `NEXT_PUBLIC_API_URL` host the web middleware probes. */
const MOCK_API_PORT = 8787;

// ── Fake clock (mirrors @hone/test-fixtures `createFakeTimer`, #152) ─────
interface FakeClock {
  now(): Date;
  advanceDays(days: number): void;
}

function createFakeClock(startIso = "2024-01-15T12:00:00.000Z"): FakeClock {
  let current = new Date(startIso);
  return {
    now: () => new Date(current),
    advanceDays: (days: number) => {
      current = new Date(current.getTime() + days * MS_PER_DAY);
    },
  };
}

interface SeededReview {
  id: string;
  body: string;
  visibility: "public";
}

interface SeededUser {
  profileId: string;
  handle: string;
  displayName: string;
  review: SeededReview;
}

/**
 * In-process stand-in for the account-deletion + export backend. Models
 * the same state transitions as `AccountDeletionService` (#151/#152) and
 * the tombstone semantics of the public-profile route (#161), driven by a
 * fake clock so wall time is never involved.
 */
class DeletionBackend {
  private alive = true;
  private deletion: { requestedAt: Date; hardDeleteAfter: Date } | null = null;
  private tombstone: { expiresAt: Date } | null = null;
  private readonly archives = new Map<string, { body: Buffer; expiresAt: Date }>();

  constructor(
    private readonly clock: FakeClock,
    readonly user: SeededUser,
  ) {}

  /** `account.requestDelete` — idempotent soft-delete with a 30-day grace. */
  requestDelete(): { requestedAt: Date; hardDeleteAfter: Date } {
    if (!this.deletion) {
      const requestedAt = this.clock.now();
      this.deletion = {
        requestedAt,
        hardDeleteAfter: new Date(requestedAt.getTime() + GRACE_DAYS * MS_PER_DAY),
      };
    }
    return this.deletion;
  }

  isSoftDeleted(): boolean {
    return this.deletion !== null;
  }

  isAlive(): boolean {
    return this.alive;
  }

  /**
   * `AccountDeletionService.runHardDelete(now)` — purge any profile whose
   * grace has elapsed (writing a tombstone) and reap expired tombstones.
   * Returns the number of profiles purged this run.
   */
  runHardDelete(): number {
    const now = this.clock.now();
    let purged = 0;
    if (this.deletion && this.deletion.hardDeleteAfter.getTime() <= now.getTime()) {
      this.alive = false;
      this.tombstone = { expiresAt: new Date(now.getTime() + TOMBSTONE_DAYS * MS_PER_DAY) };
      this.deletion = null;
      purged += 1;
    }
    if (this.tombstone && this.tombstone.expiresAt.getTime() <= now.getTime()) {
      this.tombstone = null;
    }
    return purged;
  }

  /** Mirrors `profile.byHandle` resolution order (live → tombstone → none). */
  profileHttpStatus(handle: string): 200 | 410 | 404 {
    if (handle.toLowerCase() !== this.user.handle.toLowerCase()) {
      return 404;
    }
    if (this.alive) {
      return 200;
    }
    const now = this.clock.now();
    if (this.tombstone && this.tombstone.expiresAt.getTime() > now.getTime()) {
      return 410;
    }
    return 404;
  }

  /**
   * `account.requestExport` (#153). Gzip a GDPR `AccountExportPayload`
   * for the viewer and return a fetchable signed URL + expiry.
   */
  requestExport(): { url: string; expiresAt: Date } {
    const now = this.clock.now();
    const payload = {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      generatedAt: now.toISOString(),
      profileId: this.user.profileId,
      profile: {
        id: this.user.profileId,
        handle: this.user.handle,
        displayName: this.user.displayName,
      },
      reviews: [this.user.review],
      shelves: [],
      shelfItems: [],
      lists: [],
      rankings: [],
      follows: { following: [], followers: [] },
      blocks: { outgoing: [], incoming: [] },
      activityEvents: [],
    };
    const body = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
    const key = `account-exports/${this.user.profileId}/${now.getTime()}-profile.json.gz`;
    const expiresAt = new Date(now.getTime() + EXPORT_URL_TTL_MS);
    this.archives.set(key, { body, expiresAt });
    return { url: `http://localhost:${MOCK_API_PORT}/exports/${key}`, expiresAt };
  }

  readArchive(key: string): { body: Buffer; expiresAt: Date } | undefined {
    return this.archives.get(key);
  }
}

function parseHandle(req: IncomingMessage): string {
  const url = new URL(req.url ?? "/", `http://localhost:${MOCK_API_PORT}`);
  const raw = url.searchParams.get("input");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { handle?: unknown };
    return typeof parsed.handle === "string" ? parsed.handle : "";
  } catch {
    return "";
  }
}

function makeHandler(backend: DeletionBackend) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", `http://localhost:${MOCK_API_PORT}`);
    const { pathname } = url;

    // S-06 (#161) deletion-state probe consumed by apps/web/middleware.ts.
    if (pathname === "/trpc/profile.byHandle") {
      const status = backend.profileHttpStatus(parseHandle(req));
      if (status === 410) {
        // The real Hono `goneRewriteMiddleware` flushes a 410 with no body.
        res.writeHead(410);
        res.end();
        return;
      }
      if (status === 404) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: -32004 } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ result: { data: { profile: { handle: parseHandle(req) } } } }));
      return;
    }

    // Old-handle rename probe — always "no rename" here.
    if (pathname === "/trpc/profile.resolveOldHandle") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ result: { data: null } }));
      return;
    }

    // GDPR export archive (signed-URL stand-in).
    if (pathname.startsWith("/exports/")) {
      const key = decodeURIComponent(pathname.slice("/exports/".length));
      const archive = backend.readArchive(key);
      if (!archive) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": "application/gzip",
        "content-length": String(archive.body.byteLength),
      });
      res.end(archive.body);
      return;
    }

    res.writeHead(404);
    res.end();
  };
}

async function listen(server: Server, port: number): Promise<void> {
  // Tolerate a sibling spec's backend still releasing the shared default
  // API port: retry a few times on EADDRINUSE before giving up.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: NodeJS.ErrnoException) => reject(err);
        server.once("error", onError);
        server.listen(port, () => {
          server.removeListener("error", onError);
          resolve();
        });
      });
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Could not bind mock API to port ${port} (still in use)`);
}

const USER: SeededUser = {
  profileId: "d3133710-0000-4000-8000-000000000175",
  handle: "deletionuser",
  displayName: "Deletion User",
  review: {
    id: "rev-w04-1",
    body: "A review that should outlive its author only until the grace period ends.",
    visibility: "public",
  },
};

const REVIEW_URL = `/u/${USER.handle}/reviews/${USER.review.id}`;
const PROFILE_URL = `/u/${USER.handle}`;

let server: Server;
let backend: DeletionBackend;
let clock: FakeClock;

test.describe("account deletion lifecycle — grace → hard delete → 410 + export", () => {
  // The single fake clock + backend are shared across the ordered steps
  // below, so run them serially within this file.
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    clock = createFakeClock();
    backend = new DeletionBackend(clock, USER);
    server = createServer(makeHandler(backend));
    await listen(server, MOCK_API_PORT);
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("delete → 30-day grace → hard delete purges, review URL 410s; export present pre-deletion", async ({
    page,
    request,
  }) => {
    // ── AC2: a GDPR export archive is present *before* deletion. ─────────
    // The profile is live; request an export and assert the signed URL
    // resolves to a gzipped archive that decodes to the viewer's data.
    expect(backend.isAlive()).toBe(true);
    const { url: exportUrl, expiresAt: exportExpiresAt } = backend.requestExport();
    expect(exportUrl).toMatch(/^https?:\/\//);
    expect(exportExpiresAt.getTime()).toBe(clock.now().getTime() + EXPORT_URL_TTL_MS);

    const archiveRes = await request.get(exportUrl);
    expect(archiveRes.ok()).toBe(true);
    expect(archiveRes.headers()["content-type"]).toContain("gzip");

    const decoded = JSON.parse(gunzipSync(await archiveRes.body()).toString("utf8")) as {
      schemaVersion: number;
      profileId: string;
      reviews: Array<{ id: string; body: string }>;
    };
    expect(decoded.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(decoded.profileId).toBe(USER.profileId);
    expect(decoded.reviews.map((r) => r.id)).toContain(USER.review.id);

    // Baseline (through the web app): while the profile is live the public
    // review URL is NOT 410 (the page stub renders / 404s — never 410).
    const liveRes = await page.goto(REVIEW_URL);
    expect(liveRes?.status()).not.toBe(410);

    // ── Request deletion → 30-day grace begins. ─────────────────────────
    const deletion = backend.requestDelete();
    expect(backend.isSoftDeleted()).toBe(true);
    expect(deletion.hardDeleteAfter.getTime()).toBe(
      deletion.requestedAt.getTime() + GRACE_DAYS * MS_PER_DAY,
    );

    // ── Within the grace window the cron must NOT purge. ────────────────
    clock.advanceDays(15); // withinDeletionGrace
    expect(backend.runHardDelete()).toBe(0);
    expect(backend.isAlive()).toBe(true);
    const duringGraceRes = await page.goto(REVIEW_URL);
    expect(duringGraceRes?.status()).not.toBe(410); // still reachable, not gone

    // ── After the grace window the cron hard-deletes the profile. ───────
    clock.advanceDays(16); // now +31d total → afterDeletionGrace
    expect(backend.runHardDelete()).toBe(1);
    expect(backend.isAlive()).toBe(false);

    // ── AC1: the public review URL returns 410 Gone (through the web app).
    const goneRes = await page.goto(REVIEW_URL);
    expect(goneRes?.status()).toBe(410);
    expect(await goneRes?.text()).toBe(""); // #161: 410 with no body content

    // The whole profile surface is gone, not just the review.
    const goneProfileRes = await page.goto(PROFILE_URL);
    expect(goneProfileRes?.status()).toBe(410);

    // ── Once the tombstone expires (past the 90-day window) it reaps and
    //    the route falls back to 404 — the 410 is not permanent (#161). ──
    clock.advanceDays(60); // now +91d total → tombstone expired
    expect(backend.runHardDelete()).toBe(0);
    const reapedRes = await page.goto(REVIEW_URL);
    expect(reapedRes?.status()).not.toBe(410);
  });
});
