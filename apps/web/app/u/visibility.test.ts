import { describe, it, expect } from "vitest";
import { isPubliclyVisible } from "./visibility";
import type { Visibility } from "@hone/domain";

describe("isPubliclyVisible", () => {
  it("returns true for public visibility", () => {
    expect(isPubliclyVisible("public")).toBe(true);
  });

  it("returns false for followers visibility", () => {
    expect(isPubliclyVisible("followers")).toBe(false);
  });

  it("returns false for mutuals visibility", () => {
    expect(isPubliclyVisible("mutuals")).toBe(false);
  });

  it("returns false for private visibility", () => {
    expect(isPubliclyVisible("private")).toBe(false);
  });

  it("is consistent for all four visibility tiers", () => {
    const tiers: Visibility[] = ["public", "followers", "mutuals", "private"];
    const results = tiers.map(isPubliclyVisible);
    expect(results).toEqual([true, false, false, false]);
  });
});
