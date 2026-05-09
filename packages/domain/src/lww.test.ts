import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  resolveLww,
  resolveStatusLww,
  resolvePositionLww,
  resolveFollowLww,
  resolveBlockLww,
  resolveVisibilityLww,
  type LwwWrite,
} from "./lww";
import type { ReadingStatus, Visibility } from "./types";

const readingStatuses: ReadingStatus[] = [
  "want_to_read",
  "reading",
  "finished",
  "dropped",
];

const visibilityTiers: Visibility[] = [
  "public",
  "followers",
  "mutuals",
  "private",
];

function makeWrite<T>(value: T, ms: number): LwwWrite<T> {
  return { value, updatedAt: new Date(ms) };
}

describe("resolveLww", () => {
  it("returns b when b is strictly later than a", () => {
    const a = makeWrite("old", 1000);
    const b = makeWrite("new", 2000);
    expect(resolveLww(a, b)).toBe(b);
  });

  it("returns a when a is strictly later than b", () => {
    const a = makeWrite("new", 2000);
    const b = makeWrite("old", 1000);
    expect(resolveLww(a, b)).toBe(a);
  });

  it("returns b on tie (equal timestamps — b wins as last submitted)", () => {
    const a = makeWrite("a-value", 1000);
    const b = makeWrite("b-value", 1000);
    expect(resolveLww(a, b)).toBe(b);
  });
});

describe("resolveStatusLww", () => {
  it("picks the later status write", () => {
    const earlier = makeWrite<ReadingStatus>("reading", 1000);
    const later = makeWrite<ReadingStatus>("finished", 2000);
    expect(resolveStatusLww(earlier, later).value).toBe("finished");
  });

  it("earlier status does not overwrite later", () => {
    const later = makeWrite<ReadingStatus>("finished", 2000);
    const earlier = makeWrite<ReadingStatus>("dropped", 500);
    expect(resolveStatusLww(later, earlier).value).toBe("finished");
  });

  it("succeeds regardless of order (concurrent writes)", () => {
    const a = makeWrite<ReadingStatus>("want_to_read", 100);
    const b = makeWrite<ReadingStatus>("reading", 200);
    expect(resolveStatusLww(a, b).value).toBe("reading");
    expect(resolveStatusLww(b, a).value).toBe("reading");
  });
});

describe("resolvePositionLww", () => {
  it("picks the later position write", () => {
    const earlier = makeWrite(3, 1000);
    const later = makeWrite(7, 2000);
    expect(resolvePositionLww(earlier, later).value).toBe(7);
  });
});

describe("resolveFollowLww", () => {
  it("picks the later follow state", () => {
    const followed = makeWrite(true, 1000);
    const unfollowed = makeWrite(false, 2000);
    expect(resolveFollowLww(followed, unfollowed).value).toBe(false);
  });

  it("un-follow does not win over a later re-follow", () => {
    const unfollowed = makeWrite(false, 1000);
    const refollowed = makeWrite(true, 3000);
    expect(resolveFollowLww(unfollowed, refollowed).value).toBe(true);
  });
});

describe("resolveBlockLww", () => {
  it("picks the later block state", () => {
    const blocked = makeWrite(true, 1000);
    const unblocked = makeWrite(false, 2000);
    expect(resolveBlockLww(blocked, unblocked).value).toBe(false);
  });
});

describe("resolveVisibilityLww", () => {
  it("picks the later visibility toggle", () => {
    const publicVis = makeWrite<Visibility>("public", 1000);
    const privateVis = makeWrite<Visibility>("private", 2000);
    expect(resolveVisibilityLww(publicVis, privateVis).value).toBe("private");
  });
});

describe("LWW property tests (fast-check)", () => {
  const fcDate = fc.integer({ min: 0, max: 2_000_000_000_000 }).map((ms) => new Date(ms));

  it("resolveLww always returns the write with the greater-or-equal updatedAt", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fcDate, fcDate, (va, vb, ta, tb) => {
        const a: LwwWrite<string> = { value: va, updatedAt: ta };
        const b: LwwWrite<string> = { value: vb, updatedAt: tb };
        const winner = resolveLww(a, b);
        expect(winner.updatedAt.getTime()).toBeGreaterThanOrEqual(
          ta.getTime() <= tb.getTime() ? ta.getTime() : tb.getTime()
        );
        if (ta.getTime() > tb.getTime()) {
          expect(winner).toBe(a);
        } else {
          expect(winner).toBe(b);
        }
      })
    );
  });

  it("resolveLww is deterministic — same inputs always yield same winner", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fcDate, fcDate, (va, vb, ta, tb) => {
        const a: LwwWrite<string> = { value: va, updatedAt: ta };
        const b: LwwWrite<string> = { value: vb, updatedAt: tb };
        expect(resolveLww(a, b)).toBe(resolveLww(a, b));
      })
    );
  });

  it("resolveStatusLww result is always one of the two inputs", () => {
    const fcStatus = fc.constantFrom(...readingStatuses);
    fc.assert(
      fc.property(fcStatus, fcStatus, fcDate, fcDate, (va, vb, ta, tb) => {
        const a: LwwWrite<ReadingStatus> = { value: va, updatedAt: ta };
        const b: LwwWrite<ReadingStatus> = { value: vb, updatedAt: tb };
        const winner = resolveStatusLww(a, b);
        expect([a, b]).toContain(winner);
      })
    );
  });

  it("resolveVisibilityLww result is always one of the four Posture C tiers", () => {
    const fcVisibility = fc.constantFrom(...visibilityTiers);
    fc.assert(
      fc.property(fcVisibility, fcVisibility, fcDate, fcDate, (va, vb, ta, tb) => {
        const a: LwwWrite<Visibility> = { value: va, updatedAt: ta };
        const b: LwwWrite<Visibility> = { value: vb, updatedAt: tb };
        const winner = resolveVisibilityLww(a, b);
        expect(visibilityTiers).toContain(winner.value);
      })
    );
  });

  it("resolveFollowLww — concurrent writes succeed regardless of submission order", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fcDate, fcDate, (va, vb, ta, tb) => {
        const a: LwwWrite<boolean> = { value: va, updatedAt: ta };
        const b: LwwWrite<boolean> = { value: vb, updatedAt: tb };
        const ab = resolveFollowLww(a, b);
        const ba = resolveFollowLww(b, a);
        expect(ab.value).toBe(ba.value);
        expect(ab.updatedAt.getTime()).toBe(ba.updatedAt.getTime());
      })
    );
  });

  it("resolveBlockLww — concurrent writes succeed regardless of submission order", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fcDate, fcDate, (va, vb, ta, tb) => {
        const a: LwwWrite<boolean> = { value: va, updatedAt: ta };
        const b: LwwWrite<boolean> = { value: vb, updatedAt: tb };
        const ab = resolveBlockLww(a, b);
        const ba = resolveBlockLww(b, a);
        expect(ab.value).toBe(ba.value);
        expect(ab.updatedAt.getTime()).toBe(ba.updatedAt.getTime());
      })
    );
  });
});
