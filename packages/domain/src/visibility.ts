import type { EntityId, Visibility } from "./types";

export type ViewerRelationship =
  | "self"
  | "mutual"
  | "follower"
  | "following"
  | "none";

export interface ViewerContext {
  viewerId: EntityId | null;
  relationship: ViewerRelationship;
}

export interface HasVisibility {
  visibility: Visibility;
}

const VISIBILITY_RANK: Record<Visibility, number> = {
  public: 0,
  followers: 1,
  mutuals: 2,
  private: 3,
};

export function canView(
  ctx: ViewerContext,
  visibility: Visibility
): boolean {
  if (visibility === "public") return true;
  if (ctx.viewerId === null) return false;
  if (ctx.relationship === "self") return true;
  if (visibility === "private") return false;
  if (visibility === "followers") {
    return ctx.relationship === "follower" || ctx.relationship === "mutual";
  }
  if (visibility === "mutuals") {
    return ctx.relationship === "mutual";
  }
  return false;
}

export function applyVisibilityFilter<T extends HasVisibility>(
  ctx: ViewerContext,
  items: T[]
): T[] {
  return items.filter((item) => canView(ctx, item.visibility));
}

export function effectiveVisibility(
  a: Visibility,
  b: Visibility
): Visibility {
  return VISIBILITY_RANK[a] >= VISIBILITY_RANK[b] ? a : b;
}
