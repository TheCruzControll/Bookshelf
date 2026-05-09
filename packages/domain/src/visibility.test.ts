import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { applyVisibilityFilter, resolveEffectiveVisibility } from "./visibility";
import type { ViewerCtx, ViewerRelationship } from "./visibility";
import type { Visibility } from "./types";

const VISIBILITIES: Visibility[] = ["public", "followers", "mutuals", "private"];
const RELATIONSHIPS: ViewerRelationship[] = ["self", "mutual", "follower", "none"];

function makeItem(visibility: Visibility, ownerId = "owner-1") {
  return { id: "item-1", ownerId, visibility };
}

describe("applyVisibilityFilter", () => {
  describe("public items", () => {
    it("allows anonymous viewer", () => {
      const ctx: ViewerCtx = { viewerId: null, relationship: "none" };
      const items = [makeItem("public")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(1);
    });

    it("allows logged-in viewer with no relationship", () => {
      const ctx: ViewerCtx = { viewerId: "viewer-1", relationship: "none" };
      const items = [makeItem("public")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(1);
    });
  });

  describe("followers-only items", () => {
    it("blocks anonymous viewer", () => {
      const ctx: ViewerCtx = { viewerId: null, relationship: "none" };
      const items = [makeItem("followers")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(0);
    });

    it("blocks non-follower", () => {
      const ctx: ViewerCtx = { viewerId: "viewer-1", relationship: "none" };
      const items = [makeItem("followers")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(0);
    });

    it("allows follower", () => {
      const ctx: ViewerCtx = { viewerId: "viewer-1", relationship: "follower" };
      const items = [makeItem("followers")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(1);
    });

    it("allows mutual", () => {
      const ctx: ViewerCtx = { viewerId: "viewer-1", relationship: "mutual" };
      const items = [makeItem("followers")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(1);
    });
  });

  describe("mutuals-only items", () => {
    it("blocks anonymous viewer", () => {
      const ctx: ViewerCtx = { viewerId: null, relationship: "none" };
      const items = [makeItem("mutuals")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(0);
    });

    it("blocks follower who is not mutual", () => {
      const ctx: ViewerCtx = { viewerId: "viewer-1", relationship: "follower" };
      const items = [makeItem("mutuals")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(0);
    });

    it("allows mutual", () => {
      const ctx: ViewerCtx = { viewerId: "viewer-1", relationship: "mutual" };
      const items = [makeItem("mutuals")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(1);
    });
  });

  describe("private items", () => {
    it("blocks anonymous viewer", () => {
      const ctx: ViewerCtx = { viewerId: null, relationship: "none" };
      const items = [makeItem("private")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(0);
    });

    it("blocks follower", () => {
      const ctx: ViewerCtx = { viewerId: "viewer-1", relationship: "follower" };
      const items = [makeItem("private")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(0);
    });

    it("blocks mutual", () => {
      const ctx: ViewerCtx = { viewerId: "viewer-1", relationship: "mutual" };
      const items = [makeItem("private")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(0);
    });

    it("allows owner (self relationship)", () => {
      const ctx: ViewerCtx = { viewerId: "owner-1", relationship: "self" };
      const items = [makeItem("private", "owner-1")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(1);
    });

    it("allows owner when viewerId matches ownerId", () => {
      const ctx: ViewerCtx = { viewerId: "owner-1", relationship: "none" };
      const items = [makeItem("private", "owner-1")];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(1);
    });
  });

  describe("authorId and actorId fallbacks", () => {
    it("uses authorId when ownerId absent", () => {
      const ctx: ViewerCtx = { viewerId: "author-1", relationship: "none" };
      const items = [{ id: "item-1", authorId: "author-1", visibility: "private" as Visibility }];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(1);
    });

    it("uses actorId when ownerId and authorId absent", () => {
      const ctx: ViewerCtx = { viewerId: "actor-1", relationship: "none" };
      const items = [{ id: "item-1", actorId: "actor-1", visibility: "private" as Visibility }];
      expect(applyVisibilityFilter(ctx, items)).toHaveLength(1);
    });
  });

  describe("mixed item lists", () => {
    it("filters correctly across multiple items", () => {
      const ctx: ViewerCtx = { viewerId: "viewer-1", relationship: "follower" };
      const items = [
        makeItem("public"),
        makeItem("followers"),
        makeItem("mutuals"),
        makeItem("private"),
      ];
      const result = applyVisibilityFilter(ctx, items);
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.visibility)).toEqual(["public", "followers"]);
    });
  });
});

describe("applyVisibilityFilter property tests", () => {
  const visibilityArb = fc.constantFrom(...VISIBILITIES);
  const relationshipArb = fc.constantFrom(...RELATIONSHIPS);
  const viewerIdArb = fc.oneof(fc.constant(null), fc.uuid());
  const ownerIdArb = fc.uuid();

  it("public items are always visible to any viewer", () => {
    fc.assert(
      fc.property(relationshipArb, viewerIdArb, ownerIdArb, (relationship, viewerId, ownerId) => {
        const ctx: ViewerCtx = { viewerId, relationship };
        const items = [makeItem("public", ownerId)];
        return applyVisibilityFilter(ctx, items).length === 1;
      })
    );
  });

  it("private items are only visible to the owner", () => {
    fc.assert(
      fc.property(relationshipArb, ownerIdArb, (relationship, ownerId) => {
        const viewerId = ownerId;
        const ctx: ViewerCtx = { viewerId, relationship };
        const items = [makeItem("private", ownerId)];
        return applyVisibilityFilter(ctx, items).length === 1;
      })
    );
  });

  it("private items are never visible to non-owner logged-in users", () => {
    fc.assert(
      fc.property(
        relationshipArb.filter((r) => r !== "self"),
        fc.uuid(),
        fc.uuid(),
        (relationship, viewerId, ownerId) => {
          fc.pre(viewerId !== ownerId);
          const ctx: ViewerCtx = { viewerId, relationship };
          const items = [makeItem("private", ownerId)];
          return applyVisibilityFilter(ctx, items).length === 0;
        }
      )
    );
  });

  it("anonymous viewer can only see public items", () => {
    fc.assert(
      fc.property(visibilityArb, ownerIdArb, (visibility, ownerId) => {
        const ctx: ViewerCtx = { viewerId: null, relationship: "none" };
        const items = [makeItem(visibility, ownerId)];
        const result = applyVisibilityFilter(ctx, items);
        if (visibility === "public") {
          return result.length === 1;
        }
        return result.length === 0;
      })
    );
  });

  it("filter result is consistent with access matrix", () => {
    fc.assert(
      fc.property(
        visibilityArb,
        relationshipArb,
        fc.uuid(),
        fc.uuid(),
        (visibility, relationship, viewerId, ownerId) => {
          fc.pre(viewerId !== ownerId);
          const ctx: ViewerCtx = { viewerId, relationship };
          const items = [makeItem(visibility, ownerId)];
          const result = applyVisibilityFilter(ctx, items);

          if (visibility === "public") return result.length === 1;
          if (relationship === "self") return result.length === 1;
          if (visibility === "private") return result.length === 0;
          if (visibility === "followers") {
            const canSee = relationship === "follower" || relationship === "mutual";
            return result.length === (canSee ? 1 : 0);
          }
          if (visibility === "mutuals") {
            return result.length === (relationship === "mutual" ? 1 : 0);
          }
          return false;
        }
      )
    );
  });

  it("empty item list always returns empty", () => {
    fc.assert(
      fc.property(relationshipArb, viewerIdArb, (relationship, viewerId) => {
        const ctx: ViewerCtx = { viewerId, relationship };
        return applyVisibilityFilter(ctx, []).length === 0;
      })
    );
  });
});

describe("resolveEffectiveVisibility", () => {
  it("returns the tighter of two visibilities", () => {
    expect(resolveEffectiveVisibility("public", "followers")).toBe("followers");
    expect(resolveEffectiveVisibility("followers", "public")).toBe("followers");
    expect(resolveEffectiveVisibility("followers", "mutuals")).toBe("mutuals");
    expect(resolveEffectiveVisibility("mutuals", "private")).toBe("private");
  });

  it("returns same value when both are equal", () => {
    for (const v of VISIBILITIES) {
      expect(resolveEffectiveVisibility(v, v)).toBe(v);
    }
  });

  it("is commutative", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VISIBILITIES),
        fc.constantFrom(...VISIBILITIES),
        (a, b) => {
          return resolveEffectiveVisibility(a, b) === resolveEffectiveVisibility(b, a);
        }
      )
    );
  });
});

describe("BlockFilter port composability", () => {
  it("can compose visibility filter then block filter", async () => {
    const visibilityCtx: ViewerCtx = { viewerId: "viewer-1", relationship: "follower" };
    const items = [
      { id: "item-1", ownerId: "owner-1", visibility: "public" as Visibility },
      { id: "item-2", ownerId: "owner-2", visibility: "followers" as Visibility },
      { id: "item-3", ownerId: "owner-3", visibility: "private" as Visibility },
    ];

    const visibilityFiltered = applyVisibilityFilter(visibilityCtx, items);
    expect(visibilityFiltered).toHaveLength(2);

    const blockedIds = new Set(["item-2"]);
    const blockFiltered = visibilityFiltered.filter((i) => !blockedIds.has(i.id));
    expect(blockFiltered).toHaveLength(1);
    expect(blockFiltered[0]!.id).toBe("item-1");
  });
});
