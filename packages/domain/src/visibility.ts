import type { EntityId, Visibility } from "./types";

export type ViewerRelationship = "self" | "mutual" | "follower" | "none";

export interface ViewerCtx {
  viewerId: EntityId | null;
  relationship: ViewerRelationship;
}

export interface HasVisibility {
  visibility: Visibility;
}

export interface HasOwnerId {
  ownerId?: EntityId;
  authorId?: EntityId;
  actorId?: EntityId;
}

const VISIBILITY_RANK: Record<Visibility, number> = {
  public: 0,
  followers: 1,
  mutuals: 2,
  private: 3,
};

function canView(ctx: ViewerCtx, itemOwnerId: EntityId | null | undefined, visibility: Visibility): boolean {
  if (visibility === "public") return true;

  if (ctx.viewerId === null) return false;

  if (itemOwnerId !== undefined && itemOwnerId !== null && ctx.viewerId === itemOwnerId) return true;

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

export function applyVisibilityFilter<T extends HasVisibility & HasOwnerId>(
  viewerCtx: ViewerCtx,
  items: T[]
): T[] {
  return items.filter((item) => {
    const ownerId = item.ownerId ?? item.authorId ?? item.actorId ?? null;
    return canView(viewerCtx, ownerId, item.visibility);
  });
}

export function resolveEffectiveVisibility(a: Visibility, b: Visibility): Visibility {
  return VISIBILITY_RANK[a] >= VISIBILITY_RANK[b] ? a : b;
}
