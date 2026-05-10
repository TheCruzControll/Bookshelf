import { describe, it, expect, beforeAll } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";
import { buildVisibilityWhere } from "./visibility-where";
import { shelves } from "./schema";

const dialect = new PgDialect();

function toQuery(clause: ReturnType<typeof buildVisibilityWhere>) {
  return dialect.sqlToQuery(clause);
}

const visibilityCol = getTableColumns(shelves).visibility;
const ownerCol = getTableColumns(shelves).ownerId;

const VIEWER_ID = "00000000-0000-0000-0000-000000000001";
const OWNER_ID = "00000000-0000-0000-0000-000000000002";

describe("buildVisibilityWhere", () => {
  describe("anonymous viewer (viewerId = null)", () => {
    it("only includes public visibility tier (no followers/mutuals/private params)", () => {
      const clause = buildVisibilityWhere({
        viewerId: null,
        ownerCol,
        visibilityCol,
      });
      const { params } = toQuery(clause);
      expect(params).toContain("public");
      expect(params).not.toContain("followers");
      expect(params).not.toContain("mutuals");
      expect(params).not.toContain("private");
    });

    it("does not include block enforcement for anonymous viewers", () => {
      const clause = buildVisibilityWhere({
        viewerId: null,
        ownerCol,
        visibilityCol,
      });
      const { sql } = toQuery(clause);
      expect(sql).not.toContain("blocks");
    });
  });

  describe("authenticated viewer", () => {
    let queryResult: ReturnType<typeof toQuery>;

    beforeAll(() => {
      const clause = buildVisibilityWhere({
        viewerId: VIEWER_ID,
        ownerCol,
        visibilityCol,
      });
      queryResult = toQuery(clause);
    });

    it("includes public visibility tier", () => {
      expect(queryResult.params).toContain("public");
    });

    it("includes followers visibility tier with follow subquery", () => {
      expect(queryResult.params).toContain("followers");
      expect(queryResult.sql).toContain("follows f1");
      expect(queryResult.sql).toContain("follower_id");
      expect(queryResult.sql).toContain("followee_id");
    });

    it("honors mutuals via a second follows subquery", () => {
      expect(queryResult.params).toContain("mutuals");
      expect(queryResult.sql).toContain("follows f2");
    });

    it("includes private visibility gated to owner only", () => {
      expect(queryResult.params).toContain("private");
    });

    it("includes block enforcement in both directions", () => {
      expect(queryResult.sql).toContain("blocks b");
      expect(queryResult.sql).toContain("blocker_id");
      expect(queryResult.sql).toContain("blocked_id");
    });

    it("embeds viewerId as a query parameter", () => {
      expect(queryResult.params).toContain(VIEWER_ID);
    });
  });

  describe("self-view (viewerId equals owner)", () => {
    it("produces a valid clause that includes owner equality and private tier", () => {
      const clause = buildVisibilityWhere({
        viewerId: OWNER_ID,
        ownerCol,
        visibilityCol,
      });
      const { sql, params } = toQuery(clause);
      expect(params).toContain(OWNER_ID);
      expect(params).toContain("private");
    });
  });

  describe("structural invariants", () => {
    it("always returns a defined SQL object", () => {
      const anonymous = buildVisibilityWhere({
        viewerId: null,
        ownerCol,
        visibilityCol,
      });
      const authed = buildVisibilityWhere({
        viewerId: VIEWER_ID,
        ownerCol,
        visibilityCol,
      });
      expect(anonymous).toBeDefined();
      expect(authed).toBeDefined();
    });

    it("anonymous clause is simpler than authenticated clause (fewer params)", () => {
      const anonymous = buildVisibilityWhere({
        viewerId: null,
        ownerCol,
        visibilityCol,
      });
      const authed = buildVisibilityWhere({
        viewerId: VIEWER_ID,
        ownerCol,
        visibilityCol,
      });
      const anonQuery = toQuery(anonymous);
      const authedQuery = toQuery(authed);
      expect(authedQuery.params.length).toBeGreaterThan(anonQuery.params.length);
    });
  });
});
