import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { applyVisibilityFilter, resolveEffectiveVisibility, filterFeedByVisibility } from "./visibility";
import type { ViewerCtx, ViewerRelationship } from "./visibility";
import type { FeedItem, Visibility } from "./types";
import { POSTURE_C_DEFAULTS } from "./services";

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

describe("filterFeedByVisibility", () => {
  const NOW = new Date("2025-06-01T12:00:00Z");

  function makeFeedItemForVis(actorId: string, visibility: Visibility): FeedItem {
    return {
      event: {
        id: `event-${actorId}-${visibility}`,
        actorId,
        verb: "book_added",
        visibility,
        occurredAt: NOW,
        groupKey: `${actorId}:book_added:12345`,
      },
      actor: {
        id: actorId,
        handle: "actor",
        displayName: "Actor",
        verified: false,
        defaultVisibility: POSTURE_C_DEFAULTS,
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    };
  }

  it("shows followers-visibility items when viewer follows actor", () => {
    const viewerId = "viewer-1";
    const actorId = "actor-1";
    const items = [makeFeedItemForVis(actorId, "followers")];
    const relationshipMap = new Map([["actor-1", "follower" as ViewerRelationship]]);
    const result = filterFeedByVisibility(viewerId, items, relationshipMap);
    expect(result).toHaveLength(1);
  });

  it("shows mutuals-visibility items when viewer is mutual with actor", () => {
    const viewerId = "viewer-1";
    const actorId = "actor-1";
    const items = [makeFeedItemForVis(actorId, "mutuals")];
    const relationshipMap = new Map([["actor-1", "mutual" as ViewerRelationship]]);
    const result = filterFeedByVisibility(viewerId, items, relationshipMap);
    expect(result).toHaveLength(1);
  });

  it("hides mutuals-visibility items when viewer only follows actor", () => {
    const viewerId = "viewer-1";
    const actorId = "actor-1";
    const items = [makeFeedItemForVis(actorId, "mutuals")];
    const relationshipMap = new Map([["actor-1", "follower" as ViewerRelationship]]);
    const result = filterFeedByVisibility(viewerId, items, relationshipMap);
    expect(result).toHaveLength(0);
  });

  it("hides private-visibility items from non-self viewers", () => {
    const viewerId = "viewer-1";
    const actorId = "actor-1";
    const items = [makeFeedItemForVis(actorId, "private")];
    const relationshipMap = new Map([["actor-1", "mutual" as ViewerRelationship]]);
    const result = filterFeedByVisibility(viewerId, items, relationshipMap);
    expect(result).toHaveLength(0);
  });

  it("shows all items when viewer is the actor (self)", () => {
    const viewerId = "actor-1";
    const items = [
      makeFeedItemForVis(viewerId, "private"),
      makeFeedItemForVis(viewerId, "mutuals"),
      makeFeedItemForVis(viewerId, "followers"),
      makeFeedItemForVis(viewerId, "public"),
    ];
    const relationshipMap = new Map<string, ViewerRelationship>();
    const result = filterFeedByVisibility(viewerId, items, relationshipMap);
    expect(result).toHaveLength(4);
  });

  it("shows public items regardless of relationship", () => {
    const viewerId = "viewer-1";
    const actorId = "actor-1";
    const items = [makeFeedItemForVis(actorId, "public")];
    const relationshipMap = new Map([["actor-1", "none" as ViewerRelationship]]);
    const result = filterFeedByVisibility(viewerId, items, relationshipMap);
    expect(result).toHaveLength(1);
  });

  it("handles mixed actors with different relationships", () => {
    const viewerId = "viewer-1";
    const items = [
      makeFeedItemForVis("mutual-actor", "mutuals"),
      makeFeedItemForVis("follower-actor", "mutuals"),
      makeFeedItemForVis("follower-actor", "followers"),
    ];
    const relationshipMap = new Map<string, ViewerRelationship>([
      ["mutual-actor", "mutual"],
      ["follower-actor", "follower"],
    ]);
    const result = filterFeedByVisibility(viewerId, items, relationshipMap);
    expect(result).toHaveLength(2);
    expect(result[0]!.event.actorId).toBe("mutual-actor");
    expect(result[1]!.event.actorId).toBe("follower-actor");
    expect(result[1]!.event.visibility).toBe("followers");
  });

  it("treats unknown actors (not in map) as 'none' relationship", () => {
    const viewerId = "viewer-1";
    const items = [makeFeedItemForVis("unknown-actor", "followers")];
    const relationshipMap = new Map<string, ViewerRelationship>();
    const result = filterFeedByVisibility(viewerId, items, relationshipMap);
    expect(result).toHaveLength(0);
  });
});

describe("filterFeedByVisibility property tests", () => {
  const NOW = new Date("2025-06-01T12:00:00Z");
  const visibilityArb = fc.constantFrom<Visibility>("public", "followers", "mutuals", "private");
  const relationshipArb = fc.constantFrom<ViewerRelationship>("self", "mutual", "follower", "none");

  function makeFeedItemForProp(actorId: string, visibility: Visibility): FeedItem {
    return {
      event: {
        id: `event-${actorId}-${visibility}`,
        actorId,
        verb: "book_added",
        visibility,
        occurredAt: NOW,
        groupKey: `${actorId}:book_added:12345`,
      },
      actor: {
        id: actorId,
        handle: "actor",
        displayName: "Actor",
        verified: false,
        defaultVisibility: POSTURE_C_DEFAULTS,
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    };
  }

  it("self always sees own items at any visibility", () => {
    fc.assert(
      fc.property(visibilityArb, (visibility) => {
        const viewerId = "actor-1";
        const items = [makeFeedItemForProp(viewerId, visibility)];
        const result = filterFeedByVisibility(viewerId, items, new Map());
        return result.length === 1;
      })
    );
  });

  it("public items are always visible", () => {
    fc.assert(
      fc.property(relationshipArb, fc.uuid(), (relationship, actorId) => {
        const viewerId = "viewer-1";
        const items = [makeFeedItemForProp(actorId, "public")];
        const map = new Map([[actorId, relationship]]);
        const result = filterFeedByVisibility(viewerId, items, map);
        return result.length === 1;
      })
    );
  });

  it("private items are never visible to non-self viewers", () => {
    fc.assert(
      fc.property(
        relationshipArb.filter((r) => r !== "self"),
        fc.uuid(),
        (relationship, actorId) => {
          const viewerId = "viewer-1";
          fc.pre(viewerId !== actorId);
          const items = [makeFeedItemForProp(actorId, "private")];
          const map = new Map([[actorId, relationship]]);
          const result = filterFeedByVisibility(viewerId, items, map);
          return result.length === 0;
        }
      )
    );
  });

  it("mutuals items require mutual relationship", () => {
    fc.assert(
      fc.property(relationshipArb, fc.uuid(), (relationship, actorId) => {
        const viewerId = "viewer-1";
        fc.pre(viewerId !== actorId);
        const items = [makeFeedItemForProp(actorId, "mutuals")];
        const map = new Map([[actorId, relationship]]);
        const result = filterFeedByVisibility(viewerId, items, map);
        if (relationship === "mutual" || relationship === "self") {
          return result.length === 1;
        }
        return result.length === 0;
      })
    );
  });

  it("followers items require follower or mutual relationship", () => {
    fc.assert(
      fc.property(relationshipArb, fc.uuid(), (relationship, actorId) => {
        const viewerId = "viewer-1";
        fc.pre(viewerId !== actorId);
        const items = [makeFeedItemForProp(actorId, "followers")];
        const map = new Map([[actorId, relationship]]);
        const result = filterFeedByVisibility(viewerId, items, map);
        if (relationship === "follower" || relationship === "mutual" || relationship === "self") {
          return result.length === 1;
        }
        return result.length === 0;
      })
    );
  });

  it("filter result is always a subset of input", () => {
    fc.assert(
      fc.property(
        fc.array(visibilityArb, { minLength: 0, maxLength: 10 }),
        relationshipArb,
        fc.uuid(),
        (visibilities, relationship, actorId) => {
          const viewerId = "viewer-1";
          const items = visibilities.map((v) => makeFeedItemForProp(actorId, v));
          const map = new Map([[actorId, relationship]]);
          const result = filterFeedByVisibility(viewerId, items, map);
          return result.length <= items.length;
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

  it("Property: blocked viewer never sees content regardless of visibility or relationship", () => {
    const visibilityArb = fc.constantFrom(...VISIBILITIES);
    const relationshipArb = fc.constantFrom(...RELATIONSHIPS);

    fc.assert(
      fc.property(
        visibilityArb,
        relationshipArb,
        fc.uuid(),
        fc.uuid(),
        (visibility, relationship, viewerId, ownerId) => {
          fc.pre(viewerId !== ownerId);

          const items = [{ id: ownerId, ownerId, visibility }];

          const visibilityFiltered = applyVisibilityFilter(
            { viewerId, relationship },
            items
          );

          const blockedOwnerIds = new Set([ownerId]);
          const blockFiltered = visibilityFiltered.filter(
            (i) => !blockedOwnerIds.has(i.ownerId)
          );

          return blockFiltered.length === 0;
        }
      )
    );
  });
});
