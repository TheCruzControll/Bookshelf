import { execSync } from "node:child_process";
import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { serve } from "@hono/node-server";
import { createApi } from "@hone/api";
import {
  createDrizzleRepositories,
  startPostgresContainer,
  createMigratedDb,
  type StartedPostgresContainer,
  type MigratedDb,
} from "@hone/db";
import { POSTURE_C_DEFAULTS } from "@hone/domain";
import type { AppRepositories, AuthIdentity, AuthProvider } from "@hone/domain";

/**
 * E2E: follow → feed → privacy filter (#174, [W-03]).
 *
 * Why this spec is API-driven rather than browser-driven
 * ------------------------------------------------------
 * The follow / feed / privacy-filter behaviour lives entirely in the API +
 * domain + db layers. The web app has no surface that exercises it:
 *   - The home page renders `FeedGroupedView` with hard-coded sample data
 *     (a marketing demo); its own comment notes the real `feed.list` wiring
 *     does not exist yet.
 *   - There is no authed `/feed` route and no follow→feed stub flow (unlike
 *     `/import`, which `import.spec.ts` drives against the #106 stub backend).
 *   - `apps/api/src/server.ts` boots `createApi({ cache })` with NO
 *     repositories and NO auth provider, so the live dev server returns 401 /
 *     "Repositories not configured" for feed/follow.
 *
 * The feed's privacy boundary is enforced in SQL (`DrizzleActivityRepository
 * .getFriendFeedGrouped`: events from accounts the viewer follows, restricted
 * to `visibility = "followers"`, then block-filtered). To assert it faithfully
 * we stand up the real stack against a real Postgres, reusing the testcontainers
 * harness that shipped in `@hone/db` (`startPostgresContainer` /
 * `createMigratedDb`) — the same harness `repositories.integration.test.ts`
 * uses. We mount the real `createApi` router, serve it over HTTP, and drive it
 * with Playwright's `request` client (the same APIRequestContext the smoke spec
 * uses).
 *
 * Like the db integration tests, this spec gracefully SKIPS when Docker is not
 * available, so it is a no-op in environments without a container runtime and
 * provides real coverage wherever Docker is present (CI).
 *
 * Scenario (two-user mutual pair + a non-mutual observer):
 *   - alice & bob mutually follow each other (the mutual pair).
 *   - carol follows no one (the non-mutual observer).
 *   - bob has two activity events: one shared with followers, one private.
 * Assertions:
 *   - Before alice follows bob, bob's items are absent from her feed.
 *   - After the mutual follow, alice (mutual) sees bob's followers-tier item
 *     but NOT his private item (the privacy filter).
 *   - carol (non-mutual) never sees bob's items.
 */

const DOCKER_AVAILABLE = (() => {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

// Stable UUIDs for the three actors in the scenario.
const ALICE_ID = "0000a11c-0000-4000-8000-000000000001";
const BOB_ID = "0000b0b0-0000-4000-8000-000000000002";
const CAROL_ID = "0000ca01-0000-4000-8000-000000000003";

interface FeedEvent {
  id: string;
  actorId: string;
  verb: string;
  visibility: string;
}
interface FeedItemShape {
  event: FeedEvent;
}
interface FeedGroupShape {
  groupKey: string;
  items: FeedItemShape[];
}

test.describe("follow → feed → privacy filter (W-03)", () => {
  // Requires a Postgres testcontainer; skip cleanly where Docker is absent.
  test.skip(!DOCKER_AVAILABLE, "Requires Docker for the Postgres testcontainer");
  // Serial: tests share one container and mutate follow state across steps.
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  let container: StartedPostgresContainer;
  let db: MigratedDb;
  let server: ReturnType<typeof serve> | undefined;
  let api: APIRequestContext;

  // The wired API resolves the *current* identity from this mutable holder.
  // Tests run serially and await every request before the next, so setting it
  // immediately before a call is race-free.
  let currentIdentity: AuthIdentity | null = null;
  const asUser = (id: string | null) => {
    currentIdentity = id === null ? null : { userId: id };
  };

  // IDs of bob's two seeded events, captured at seed time.
  let followersEventId: string;
  let privateEventId: string;

  test.beforeAll(async () => {
    test.setTimeout(120_000);

    container = await startPostgresContainer();
    db = await createMigratedDb(container.connectionString);
    const repos: AppRepositories = createDrizzleRepositories(db);

    // --- Seed profiles (the FK target for follows + activity) ---
    await repos.profiles.create({
      id: ALICE_ID,
      handle: "alice",
      displayName: "Alice",
      defaultVisibility: POSTURE_C_DEFAULTS,
    });
    await repos.profiles.create({
      id: BOB_ID,
      handle: "bob",
      displayName: "Bob",
      defaultVisibility: POSTURE_C_DEFAULTS,
    });
    await repos.profiles.create({
      id: CAROL_ID,
      handle: "carol",
      displayName: "Carol",
      defaultVisibility: POSTURE_C_DEFAULTS,
    });

    // --- Seed bob's activity: one followers-tier item, one private item ---
    const followersEvent = await repos.activity.append({
      actorId: BOB_ID,
      verb: "book_added",
      visibility: "followers",
      groupKey: `${BOB_ID}:book_added:1`,
    });
    followersEventId = followersEvent.id;

    const privateEvent = await repos.activity.append({
      actorId: BOB_ID,
      verb: "book_finished",
      visibility: "private",
      groupKey: `${BOB_ID}:book_finished:1`,
    });
    privateEventId = privateEvent.id;

    // --- Mount the real API (no cache → no rate limiting) and serve it ---
    const auth: AuthProvider = {
      getCurrentIdentity: async () => currentIdentity,
    };
    const app = createApi({ repositories: repos, auth });

    const port = await new Promise<number>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0 }, (info) => {
        resolve(info.port);
      });
    });

    api = await request.newContext({ baseURL: `http://127.0.0.1:${port}` });
  });

  test.afterAll(async () => {
    await api?.dispose();
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await db?.endPool();
    await container?.stop();
  });

  // --- Helpers -------------------------------------------------------------

  async function feedEventIdsAs(userId: string): Promise<string[]> {
    asUser(userId);
    const res = await api.get(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`,
    );
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as {
      result: { data: { groups: FeedGroupShape[] } };
    };
    return body.result.data.groups.flatMap((g) =>
      g.items.map((i) => i.event.id),
    );
  }

  async function followAs(followerId: string, followeeId: string) {
    asUser(followerId);
    const res = await api.post("/trpc/follow.create", {
      data: { followeeId },
    });
    expect(res.status(), await res.text()).toBe(200);
  }

  // --- Tests ---------------------------------------------------------------

  test("a non-follower does not see the actor's items in their feed", async () => {
    // Alice follows no one yet → her friend feed is empty.
    const ids = await feedEventIdsAs(ALICE_ID);
    expect(ids).not.toContain(followersEventId);
    expect(ids).toHaveLength(0);
  });

  test("after a mutual follow, the mutual sees followers-tier items but not private ones", async () => {
    // Establish the mutual relationship through the real follow.create path.
    await followAs(ALICE_ID, BOB_ID);
    await followAs(BOB_ID, ALICE_ID);

    const ids = await feedEventIdsAs(ALICE_ID);
    // Mutual sees bob's followers-tier item...
    expect(ids).toContain(followersEventId);
    // ...but the privacy filter still hides his private item.
    expect(ids).not.toContain(privateEventId);
  });

  test("a non-mutual stranger never sees the actor's items", async () => {
    // Carol follows no one and is not in any follow relationship with bob.
    const ids = await feedEventIdsAs(CAROL_ID);
    expect(ids).not.toContain(followersEventId);
    expect(ids).not.toContain(privateEventId);
    expect(ids).toHaveLength(0);
  });
});
