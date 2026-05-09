import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  applyVisibilityFilter,
  canView,
  effectiveVisibility,
  type ViewerContext,
  type ViewerRelationship,
} from "./visibility";
import type { Visibility } from "./types";

const ALL_VISIBILITIES: Visibility[] = ["public", "followers", "mutuals", "private"];
const ALL_RELATIONSHIPS: ViewerRelationship[] = ["self", "mutual", "follower", "following", "none"];

function makeCtx(
  relationship: ViewerRelationship,
  viewerId: string | null = relationship === "none" ? null : "viewer-1"
): ViewerContext {
  return { viewerId, relationship };
}

describe("canView", () => {
  it("public content is visible to everyone including anonymous", () => {
    for (const rel of ALL_RELATIONSHIPS) {
      expect(canView(makeCtx(rel, null), "public")).toBe(true);
      expect(canView(makeCtx(rel), "public")).toBe(true);
    }
    expect(canView({ viewerId: null, relationship: "none" }, "public")).toBe(true);
  });

  it("followers content is visible to self, follower, and mutual", () => {
    expect(canView(makeCtx("self"), "followers")).toBe(true);
    expect(canView(makeCtx("follower"), "followers")).toBe(true);
    expect(canView(makeCtx("mutual"), "followers")).toBe(true);
  });

  it("followers content is NOT visible to following-only or none", () => {
    expect(canView(makeCtx("following"), "followers")).toBe(false);
    expect(canView(makeCtx("none"), "followers")).toBe(false);
    expect(canView({ viewerId: null, relationship: "none" }, "followers")).toBe(false);
  });

  it("mutuals content is only visible to self and mutual", () => {
    expect(canView(makeCtx("self"), "mutuals")).toBe(true);
    expect(canView(makeCtx("mutual"), "mutuals")).toBe(true);
    expect(canView(makeCtx("follower"), "mutuals")).toBe(false);
    expect(canView(makeCtx("following"), "mutuals")).toBe(false);
    expect(canView(makeCtx("none"), "mutuals")).toBe(false);
  });

  it("private content is only visible to self", () => {
    expect(canView(makeCtx("self"), "private")).toBe(true);
    expect(canView(makeCtx("mutual"), "private")).toBe(false);
    expect(canView(makeCtx("follower"), "private")).toBe(false);
    expect(canView(makeCtx("following"), "private")).toBe(false);
    expect(canView(makeCtx("none"), "private")).toBe(false);
    expect(canView({ viewerId: null, relationship: "none" }, "private")).toBe(false);
  });

  it("non-null viewerId but relationship=none cannot see followers content", () => {
    expect(canView({ viewerId: "stranger-1", relationship: "none" }, "followers")).toBe(false);
  });
});

describe("applyVisibilityFilter", () => {
  it("returns only visible items", () => {
    const items = [
      { id: "1", visibility: "public" as Visibility },
      { id: "2", visibility: "followers" as Visibility },
      { id: "3", visibility: "mutuals" as Visibility },
      { id: "4", visibility: "private" as Visibility },
    ];

    const ctx = makeCtx("none", "viewer-1");
    expect(applyVisibilityFilter(ctx, items)).toEqual([items[0]]);
  });

  it("follower sees public and followers items", () => {
    const items = [
      { id: "1", visibility: "public" as Visibility },
      { id: "2", visibility: "followers" as Visibility },
      { id: "3", visibility: "mutuals" as Visibility },
      { id: "4", visibility: "private" as Visibility },
    ];

    const ctx = makeCtx("follower");
    const result = applyVisibilityFilter(ctx, items);
    expect(result.map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("mutual sees public, followers, and mutuals items", () => {
    const items = [
      { id: "1", visibility: "public" as Visibility },
      { id: "2", visibility: "followers" as Visibility },
      { id: "3", visibility: "mutuals" as Visibility },
      { id: "4", visibility: "private" as Visibility },
    ];

    const ctx = makeCtx("mutual");
    const result = applyVisibilityFilter(ctx, items);
    expect(result.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("self sees all items", () => {
    const items = [
      { id: "1", visibility: "public" as Visibility },
      { id: "2", visibility: "followers" as Visibility },
      { id: "3", visibility: "mutuals" as Visibility },
      { id: "4", visibility: "private" as Visibility },
    ];

    const ctx = makeCtx("self");
    expect(applyVisibilityFilter(ctx, items)).toEqual(items);
  });

  it("returns empty array when no items are visible", () => {
    const items = [
      { id: "1", visibility: "private" as Visibility },
      { id: "2", visibility: "mutuals" as Visibility },
    ];
    expect(applyVisibilityFilter(makeCtx("none"), items)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(applyVisibilityFilter(makeCtx("mutual"), [])).toEqual([]);
  });
});

describe("effectiveVisibility", () => {
  it("returns the tighter visibility (higher rank)", () => {
    expect(effectiveVisibility("public", "private")).toBe("private");
    expect(effectiveVisibility("followers", "public")).toBe("followers");
    expect(effectiveVisibility("mutuals", "followers")).toBe("mutuals");
    expect(effectiveVisibility("private", "mutuals")).toBe("private");
  });

  it("returns same visibility when both are equal", () => {
    for (const v of ALL_VISIBILITIES) {
      expect(effectiveVisibility(v, v)).toBe(v);
    }
  });
});

describe("property tests", () => {
  const arbVisibility = fc.constantFrom(...ALL_VISIBILITIES);
  const arbRelationship = fc.constantFrom(...ALL_RELATIONSHIPS);
  const arbViewerId = fc.oneof(fc.constant(null), fc.uuid());

  it("canView result is consistent with the access matrix", () => {
    fc.assert(
      fc.property(
        arbRelationship,
        arbViewerId,
        arbVisibility,
        (relationship, viewerId, visibility) => {
          const effectiveViewerId = viewerId === null || relationship === "none" ? null : viewerId;
          const ctx: ViewerContext = {
            viewerId: effectiveViewerId,
            relationship,
          };
          const result = canView(ctx, visibility);

          if (visibility === "public") return result === true;
          if (effectiveViewerId === null) return result === false;
          if (relationship === "self") return result === true;
          if (visibility === "private") return result === false;
          if (visibility === "followers")
            return result === (relationship === "follower" || relationship === "mutual");
          if (visibility === "mutuals") return result === (relationship === "mutual");
          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it("applyVisibilityFilter never returns items the viewer cannot see", () => {
    fc.assert(
      fc.property(
        arbRelationship,
        fc.uuid(),
        fc.array(fc.record({ id: fc.uuid(), visibility: arbVisibility }), { maxLength: 20 }),
        (relationship, viewerId, items) => {
          const ctx: ViewerContext = { viewerId, relationship };
          const result = applyVisibilityFilter(ctx, items);
          return result.every((item) => canView(ctx, item.visibility));
        }
      ),
      { numRuns: 500 }
    );
  });

  it("applyVisibilityFilter never drops items the viewer can see", () => {
    fc.assert(
      fc.property(
        arbRelationship,
        fc.uuid(),
        fc.array(fc.record({ id: fc.uuid(), visibility: arbVisibility }), { maxLength: 20 }),
        (relationship, viewerId, items) => {
          const ctx: ViewerContext = { viewerId, relationship };
          const result = applyVisibilityFilter(ctx, items);
          const resultIds = new Set(result.map((i) => i.id));
          return items
            .filter((item) => canView(ctx, item.visibility))
            .every((item) => resultIds.has(item.id));
        }
      ),
      { numRuns: 500 }
    );
  });

  it("effectiveVisibility is commutative", () => {
    fc.assert(
      fc.property(arbVisibility, arbVisibility, (a, b) => {
        return effectiveVisibility(a, b) === effectiveVisibility(b, a);
      }),
      { numRuns: 200 }
    );
  });

  it("effectiveVisibility is idempotent", () => {
    fc.assert(
      fc.property(arbVisibility, (v) => {
        return effectiveVisibility(v, v) === v;
      })
    );
  });

  it("effectiveVisibility result is always one of the two inputs", () => {
    fc.assert(
      fc.property(arbVisibility, arbVisibility, (a, b) => {
        const result = effectiveVisibility(a, b);
        return result === a || result === b;
      }),
      { numRuns: 200 }
    );
  });
});
