import { and, eq, not, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export interface ViewerWhereCfg {
  viewerId: string | null;
  ownerCol: PgColumn;
  visibilityCol: PgColumn;
}

/**
 * buildVisibilityWhere
 *
 * Returns a Drizzle SQL condition that enforces Posture C visibility rules
 * entirely in the database, replacing post-fetch `applyVisibilityFilter` calls
 * for queries that benefit from server-side filtering (e.g. paginated feeds,
 * large shelf lists).
 *
 * Visibility matrix applied:
 *   public    → always visible
 *   followers → viewer follows the owner (or viewer IS the owner)
 *   mutuals   → viewer follows owner AND owner follows viewer (or viewer IS owner)
 *   private   → only owner
 *
 * Block enforcement:
 *   Any row where a block exists between viewer and owner in either direction
 *   is excluded, regardless of visibility tier.
 *
 * Anonymous callers (viewerId = null):
 *   Only `public` rows are returned; block enforcement is skipped.
 *
 * Usage in a repository:
 *
 *   import { buildVisibilityWhere } from "./visibility-where";
 *
 *   const where = buildVisibilityWhere({
 *     viewerId: ctx.viewerId,
 *     ownerCol: shelves.ownerId,
 *     visibilityCol: shelves.visibility,
 *   });
 *
 *   const rows = await db.select().from(shelves).where(where);
 */
export function buildVisibilityWhere(cfg: ViewerWhereCfg): SQL {
  const { viewerId, ownerCol, visibilityCol } = cfg;

  const publicClause = eq(visibilityCol, "public") as SQL;

  if (viewerId === null) {
    return publicClause;
  }

  const isOwner = eq(ownerCol, viewerId) as SQL;

  const viewerFollowsOwner = sql`EXISTS (
    SELECT 1 FROM follows f1
    WHERE f1.follower_id = ${viewerId}::uuid
      AND f1.followee_id = ${ownerCol}
  )` as SQL;

  const ownerFollowsViewer = sql`EXISTS (
    SELECT 1 FROM follows f2
    WHERE f2.follower_id = ${ownerCol}
      AND f2.followee_id = ${viewerId}::uuid
  )` as SQL;

  const followersClause = and(
    eq(visibilityCol, "followers"),
    or(isOwner, viewerFollowsOwner)
  ) as SQL;

  const mutualsClause = and(
    eq(visibilityCol, "mutuals"),
    or(isOwner, and(viewerFollowsOwner, ownerFollowsViewer))
  ) as SQL;

  const privateClause = and(eq(visibilityCol, "private"), isOwner) as SQL;

  const notBlocked = not(
    sql`EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = ${viewerId}::uuid AND b.blocked_id = ${ownerCol})
         OR (b.blocker_id = ${ownerCol} AND b.blocked_id = ${viewerId}::uuid)
    )`
  ) as SQL;

  return and(
    or(publicClause, followersClause, mutualsClause, privateClause),
    notBlocked
  ) as SQL;
}
