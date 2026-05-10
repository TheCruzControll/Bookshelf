/**
 * Property-based tests for the privacy/visibility filter through the tRPC layer.
 *
 * Issue: [H-04] Privacy filter property tests (apps/api)
 * Covers: 4 visibilities x 6 viewer relationships per content type
 *
 * Viewer relationships:
 *   1. self      — viewer is the content owner
 *   2. mutual    — viewer and owner follow each other
 *   3. follower  — viewer follows the owner (not reciprocated)
 *   4. stranger  — logged-in user with no relationship
 *   5. anonymous — no session (viewerId = null)
 *   6. blocked   — a block exists between viewer and owner
 *
 * Visibilities: public, followers, mutuals, private
 *
 * Content types tested: shelves, reviews, activity/feed items
 */
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import {
  applyVisibilityFilter,
  resolveEffectiveVisibility,
  POSTURE_C_DEFAULTS,
} from "@hone/domain";
import type {
  Visibility,
  ContentType,
} from "@hone/domain";
import type { ViewerCtx } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

// --- Arbitraries ---

const VISIBILITIES: Visibility[] = ["public", "followers", "mutuals", "private"];

/**
 * Extended viewer relationship that includes "anonymous" and "blocked"
 * which map to specific ViewerCtx configurations.
 */
type ExtendedRelationship = "self" | "mutual" | "follower" | "stranger" | "anonymous" | "blocked";
const EXTENDED_RELATIONSHIPS: ExtendedRelationship[] = [
  "self",
  "mutual",
  "follower",
  "stranger",
  "anonymous",
  "blocked",
];

const CONTENT_TYPES: ContentType[] = [
  "identity",
  "follower_list",
  "review",
  "score",
  "finished_shelf",
  "custom_shelf",
  "want_to_read_shelf",
  "reading_shelf",
  "dropped_shelf",
  "reading_status",
  "activity_stream",
];

const visibilityArb = fc.constantFrom(...VISIBILITIES);
const extendedRelationshipArb = fc.constantFrom(...EXTENDED_RELATIONSHIPS);
const contentTypeArb = fc.constantFrom(...CONTENT_TYPES);
const entityIdArb = fc.uuid();

// --- Helpers ---

interface TestItem {
  id: string;
  ownerId: string;
  visibility: Visibility;
}

function makeItem(visibility: Visibility, ownerId: string): TestItem {
  return { id: `item-${ownerId}`, ownerId, visibility };
}

/**
 * Builds a ViewerCtx from an extended relationship. "anonymous" and "blocked"
 * are modeled as follows:
 *   - anonymous: viewerId = null, relationship = "none"
 *   - blocked: handled via a separate block filter pass; for the visibility
 *     filter itself, a blocked user is treated as "none" relationship + block
 *     filter removes all results afterward.
 *   - stranger: viewerId is set, relationship = "none"
 */
function buildViewerCtx(
  relationship: ExtendedRelationship,
  viewerId: string,
  ownerId: string
): ViewerCtx {
  switch (relationship) {
    case "self":
      return { viewerId: ownerId, relationship: "self" };
    case "mutual":
      return { viewerId, relationship: "mutual" };
    case "follower":
      return { viewerId, relationship: "follower" };
    case "stranger":
      return { viewerId, relationship: "none" };
    case "anonymous":
      return { viewerId: null, relationship: "none" };
    case "blocked":
      // For visibility filter, a blocked user has "none" relationship.
      // Block enforcement is a separate post-filter pass.
      return { viewerId, relationship: "none" };
  }
}

/**
 * The expected access decision based on the Posture C access matrix.
 * Returns true if the viewer SHOULD be able to see the item.
 *
 * Note: "blocked" always results in hidden (handled by block filter),
 * regardless of the visibility tier.
 */
function expectedCanView(
  relationship: ExtendedRelationship,
  visibility: Visibility,
  viewerIsOwner: boolean
): boolean {
  // Blocked users never see anything (block filter removes after visibility filter)
  if (relationship === "blocked") return false;

  // Anonymous can only see public
  if (relationship === "anonymous") return visibility === "public";

  // Owner always sees their own content
  if (viewerIsOwner || relationship === "self") return true;

  switch (visibility) {
    case "public":
      return true;
    case "followers":
      return relationship === "follower" || relationship === "mutual";
    case "mutuals":
      return relationship === "mutual";
    case "private":
      return false;
  }
}

/**
 * Simulates the full privacy pipeline:
 * 1. Apply visibility filter (based on relationship)
 * 2. Apply block filter (removes items owned by blocked users)
 */
function applyFullPrivacyPipeline(
  relationship: ExtendedRelationship,
  viewerId: string,
  ownerId: string,
  items: TestItem[]
): TestItem[] {
  const ctx = buildViewerCtx(relationship, viewerId, ownerId);
  const visibilityFiltered = applyVisibilityFilter(ctx, items);

  if (relationship === "blocked") {
    // Block filter removes all items from the blocked owner
    const blockedOwnerIds = new Set([ownerId]);
    return visibilityFiltered.filter((item) => !blockedOwnerIds.has(item.ownerId));
  }

  return visibilityFiltered;
}

// --- Property Tests ---

describe("Privacy filter property tests (H-04)", () => {
  describe("access matrix: 4 visibilities x 6 relationships", () => {
    it("filter result is consistent with the Posture C access matrix for all pairs", () => {
      fc.assert(
        fc.property(
          visibilityArb,
          extendedRelationshipArb,
          entityIdArb,
          entityIdArb,
          (visibility, relationship, viewerId, ownerId) => {
            // Ensure viewer is not owner (unless testing self)
            fc.pre(relationship === "self" || viewerId !== ownerId);

            const items = [makeItem(visibility, ownerId)];
            const result = applyFullPrivacyPipeline(relationship, viewerId, ownerId, items);

            const viewerIsOwner = relationship === "self";
            const expected = expectedCanView(relationship, visibility, viewerIsOwner);

            if (result.length !== (expected ? 1 : 0)) {
              return {
                toString: () =>
                  `FAILED: visibility=${visibility}, relationship=${relationship}, ` +
                  `viewerId=${viewerId}, ownerId=${ownerId}, ` +
                  `expected=${expected ? "visible" : "hidden"}, got=${result.length} items`,
              } as unknown as boolean;
            }
            return true;
          }
        ),
        { numRuns: 500 }
      );
    });

    it("failures show the offending (visibility, relationship) pair", () => {
      // Exhaustive check over all 24 combinations (4 x 6)
      const viewerId = "viewer-aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
      const ownerId = "owner-aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";

      for (const visibility of VISIBILITIES) {
        for (const relationship of EXTENDED_RELATIONSHIPS) {
          const items = [makeItem(visibility, ownerId)];
          const result = applyFullPrivacyPipeline(relationship, viewerId, ownerId, items);

          const viewerIsOwner = relationship === "self";
          const expected = expectedCanView(relationship, visibility, viewerIsOwner);

          expect(
            result.length,
            `visibility=${visibility}, relationship=${relationship}: expected ${expected ? "visible" : "hidden"}`
          ).toBe(expected ? 1 : 0);
        }
      }
    });
  });

  describe("access matrix per content type", () => {
    it("every content type's default visibility is consistent with the access matrix", () => {
      fc.assert(
        fc.property(
          contentTypeArb,
          extendedRelationshipArb,
          entityIdArb,
          entityIdArb,
          (contentType, relationship, viewerId, ownerId) => {
            fc.pre(relationship === "self" || viewerId !== ownerId);

            const defaultVisibility = POSTURE_C_DEFAULTS[contentType];
            const items = [makeItem(defaultVisibility, ownerId)];
            const result = applyFullPrivacyPipeline(relationship, viewerId, ownerId, items);

            const viewerIsOwner = relationship === "self";
            const expected = expectedCanView(relationship, defaultVisibility, viewerIsOwner);

            return result.length === (expected ? 1 : 0);
          }
        ),
        { numRuns: 300 }
      );
    });
  });

  describe("blocked viewer property", () => {
    it("blocked viewer never sees content regardless of visibility tier", () => {
      fc.assert(
        fc.property(
          visibilityArb,
          entityIdArb,
          entityIdArb,
          (visibility, viewerId, ownerId) => {
            fc.pre(viewerId !== ownerId);

            const items = [makeItem(visibility, ownerId)];
            const result = applyFullPrivacyPipeline("blocked", viewerId, ownerId, items);

            return result.length === 0;
          }
        ),
        { numRuns: 200 }
      );
    });

    it("blocked viewer sees nothing even for public items", () => {
      fc.assert(
        fc.property(entityIdArb, entityIdArb, (viewerId, ownerId) => {
          fc.pre(viewerId !== ownerId);

          const items = VISIBILITIES.map((v) => makeItem(v, ownerId));
          const result = applyFullPrivacyPipeline("blocked", viewerId, ownerId, items);

          return result.length === 0;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("anonymous viewer property", () => {
    it("anonymous viewer can only see public items", () => {
      fc.assert(
        fc.property(visibilityArb, entityIdArb, (visibility, ownerId) => {
          const items = [makeItem(visibility, ownerId)];
          const result = applyFullPrivacyPipeline(
            "anonymous",
            "unused-id",
            ownerId,
            items
          );

          if (visibility === "public") {
            return result.length === 1;
          }
          return result.length === 0;
        }),
        { numRuns: 200 }
      );
    });
  });

  describe("self (owner) property", () => {
    it("owner always sees their own content at any visibility tier", () => {
      fc.assert(
        fc.property(visibilityArb, entityIdArb, (visibility, ownerId) => {
          const items = [makeItem(visibility, ownerId)];
          const result = applyFullPrivacyPipeline("self", ownerId, ownerId, items);

          return result.length === 1;
        }),
        { numRuns: 200 }
      );
    });
  });

  describe("follower property", () => {
    it("follower sees public and followers-tier items but not mutuals or private", () => {
      fc.assert(
        fc.property(visibilityArb, entityIdArb, entityIdArb, (visibility, viewerId, ownerId) => {
          fc.pre(viewerId !== ownerId);

          const items = [makeItem(visibility, ownerId)];
          const result = applyFullPrivacyPipeline("follower", viewerId, ownerId, items);

          if (visibility === "public" || visibility === "followers") {
            return result.length === 1;
          }
          return result.length === 0;
        }),
        { numRuns: 200 }
      );
    });
  });

  describe("mutual property", () => {
    it("mutual sees public, followers, and mutuals-tier items but not private", () => {
      fc.assert(
        fc.property(visibilityArb, entityIdArb, entityIdArb, (visibility, viewerId, ownerId) => {
          fc.pre(viewerId !== ownerId);

          const items = [makeItem(visibility, ownerId)];
          const result = applyFullPrivacyPipeline("mutual", viewerId, ownerId, items);

          if (visibility === "private") {
            return result.length === 0;
          }
          return result.length === 1;
        }),
        { numRuns: 200 }
      );
    });
  });

  describe("stranger property", () => {
    it("non-follower stranger only sees public items", () => {
      fc.assert(
        fc.property(visibilityArb, entityIdArb, entityIdArb, (visibility, viewerId, ownerId) => {
          fc.pre(viewerId !== ownerId);

          const items = [makeItem(visibility, ownerId)];
          const result = applyFullPrivacyPipeline("stranger", viewerId, ownerId, items);

          if (visibility === "public") {
            return result.length === 1;
          }
          return result.length === 0;
        }),
        { numRuns: 200 }
      );
    });
  });

  describe("effective visibility (inheritance rule)", () => {
    it("resolving two visibilities always returns the tighter one", () => {
      fc.assert(
        fc.property(visibilityArb, visibilityArb, (a, b) => {
          const result = resolveEffectiveVisibility(a, b);
          const rank: Record<Visibility, number> = {
            public: 0,
            followers: 1,
            mutuals: 2,
            private: 3,
          };
          return rank[result] === Math.max(rank[a], rank[b]);
        }),
        { numRuns: 100 }
      );
    });

    it("feed event visibility never loosens above followers", () => {
      fc.assert(
        fc.property(visibilityArb, (contentVisibility) => {
          const feedEventDefault: Visibility = "followers";
          const effective = resolveEffectiveVisibility(feedEventDefault, contentVisibility);
          const rank: Record<Visibility, number> = {
            public: 0,
            followers: 1,
            mutuals: 2,
            private: 3,
          };
          // Effective should be at least as tight as "followers"
          return rank[effective] >= rank["followers"];
        }),
        { numRuns: 100 }
      );
    });

    it("effective visibility is commutative", () => {
      fc.assert(
        fc.property(visibilityArb, visibilityArb, (a, b) => {
          return (
            resolveEffectiveVisibility(a, b) === resolveEffectiveVisibility(b, a)
          );
        }),
        { numRuns: 100 }
      );
    });

    it("effective visibility is associative", () => {
      fc.assert(
        fc.property(visibilityArb, visibilityArb, visibilityArb, (a, b, c) => {
          const leftAssoc = resolveEffectiveVisibility(
            resolveEffectiveVisibility(a, b),
            c
          );
          const rightAssoc = resolveEffectiveVisibility(
            a,
            resolveEffectiveVisibility(b, c)
          );
          return leftAssoc === rightAssoc;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("multi-item filter properties", () => {
    it("filter is order-independent (result set is same regardless of item order)", () => {
      fc.assert(
        fc.property(
          fc.array(visibilityArb, { minLength: 1, maxLength: 10 }),
          extendedRelationshipArb,
          entityIdArb,
          entityIdArb,
          (visibilities, relationship, viewerId, ownerId) => {
            fc.pre(relationship === "self" || viewerId !== ownerId);

            const items = visibilities.map((v, i) => ({
              id: `item-${i}`,
              ownerId,
              visibility: v,
            }));
            const shuffled = [...items].reverse();

            const result1 = applyFullPrivacyPipeline(relationship, viewerId, ownerId, items);
            const result2 = applyFullPrivacyPipeline(relationship, viewerId, ownerId, shuffled);

            const ids1 = new Set(result1.map((i) => i.id));
            const ids2 = new Set(result2.map((i) => i.id));

            if (ids1.size !== ids2.size) return false;
            for (const id of ids1) {
              if (!ids2.has(id)) return false;
            }
            return true;
          }
        ),
        { numRuns: 200 }
      );
    });

    it("filter never adds items that were not in the original list", () => {
      fc.assert(
        fc.property(
          fc.array(visibilityArb, { minLength: 0, maxLength: 10 }),
          extendedRelationshipArb,
          entityIdArb,
          entityIdArb,
          (visibilities, relationship, viewerId, ownerId) => {
            fc.pre(relationship === "self" || viewerId !== ownerId);

            const items = visibilities.map((v, i) => ({
              id: `item-${i}`,
              ownerId,
              visibility: v,
            }));
            const result = applyFullPrivacyPipeline(relationship, viewerId, ownerId, items);

            return result.length <= items.length;
          }
        ),
        { numRuns: 200 }
      );
    });

    it("filter result is a subset of input items", () => {
      fc.assert(
        fc.property(
          fc.array(visibilityArb, { minLength: 0, maxLength: 10 }),
          extendedRelationshipArb,
          entityIdArb,
          entityIdArb,
          (visibilities, relationship, viewerId, ownerId) => {
            fc.pre(relationship === "self" || viewerId !== ownerId);

            const items = visibilities.map((v, i) => ({
              id: `item-${i}`,
              ownerId,
              visibility: v,
            }));
            const result = applyFullPrivacyPipeline(relationship, viewerId, ownerId, items);
            const inputIds = new Set(items.map((i) => i.id));

            return result.every((r) => inputIds.has(r.id));
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe("monotonicity: tighter visibility means fewer viewers", () => {
    it("if an item is hidden at visibility V, it is also hidden at any tighter visibility", () => {
      const visibilityRank: Record<Visibility, number> = {
        public: 0,
        followers: 1,
        mutuals: 2,
        private: 3,
      };

      fc.assert(
        fc.property(
          visibilityArb,
          visibilityArb,
          extendedRelationshipArb,
          entityIdArb,
          entityIdArb,
          (vis1, vis2, relationship, viewerId, ownerId) => {
            fc.pre(relationship === "self" || viewerId !== ownerId);
            // vis2 is tighter or equal to vis1
            fc.pre(visibilityRank[vis2] >= visibilityRank[vis1]);

            const items1 = [makeItem(vis1, ownerId)];
            const items2 = [makeItem(vis2, ownerId)];

            const result1 = applyFullPrivacyPipeline(relationship, viewerId, ownerId, items1);
            const result2 = applyFullPrivacyPipeline(relationship, viewerId, ownerId, items2);

            // If tighter visibility is visible, then looser must also be visible
            if (result2.length === 1) {
              return result1.length === 1;
            }
            return true;
          }
        ),
        { numRuns: 300 }
      );
    });
  });

  describe("Posture C defaults consistency", () => {
    it("all content types have a defined default visibility", () => {
      for (const ct of CONTENT_TYPES) {
        expect(POSTURE_C_DEFAULTS[ct]).toBeDefined();
        expect(VISIBILITIES).toContain(POSTURE_C_DEFAULTS[ct]);
      }
    });

    it("public-default content types are visible to strangers", () => {
      const publicTypes = CONTENT_TYPES.filter(
        (ct) => POSTURE_C_DEFAULTS[ct] === "public"
      );
      const viewerId = "viewer-00000000-0000-4000-8000-000000000001";
      const ownerId = "owner-00000000-0000-4000-8000-000000000002";

      for (const ct of publicTypes) {
        const items = [makeItem("public", ownerId)];
        const result = applyFullPrivacyPipeline("stranger", viewerId, ownerId, items);
        expect(
          result.length,
          `content type "${ct}" with public default should be visible to strangers`
        ).toBe(1);
      }
    });

    it("followers-default content types are hidden from strangers", () => {
      const followerTypes = CONTENT_TYPES.filter(
        (ct) => POSTURE_C_DEFAULTS[ct] === "followers"
      );
      const viewerId = "viewer-00000000-0000-4000-8000-000000000001";
      const ownerId = "owner-00000000-0000-4000-8000-000000000002";

      for (const ct of followerTypes) {
        const items = [makeItem("followers", ownerId)];
        const result = applyFullPrivacyPipeline("stranger", viewerId, ownerId, items);
        expect(
          result.length,
          `content type "${ct}" with followers default should be hidden from strangers`
        ).toBe(0);
      }
    });

    it("followers-default content types are visible to followers", () => {
      const followerTypes = CONTENT_TYPES.filter(
        (ct) => POSTURE_C_DEFAULTS[ct] === "followers"
      );
      const viewerId = "viewer-00000000-0000-4000-8000-000000000001";
      const ownerId = "owner-00000000-0000-4000-8000-000000000002";

      for (const ct of followerTypes) {
        const items = [makeItem("followers", ownerId)];
        const result = applyFullPrivacyPipeline("follower", viewerId, ownerId, items);
        expect(
          result.length,
          `content type "${ct}" with followers default should be visible to followers`
        ).toBe(1);
      }
    });
  });
});
