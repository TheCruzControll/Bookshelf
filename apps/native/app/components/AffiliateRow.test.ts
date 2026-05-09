import { describe, it, expect } from "vitest";
import { sortRetailersForPlatform } from "./affiliateSort";
import type { AffiliateRetailer } from "@hone/domain";

const ALL_US_RETAILERS: AffiliateRetailer[] = [
  "bookshop",
  "amazon",
  "audible",
  "apple_books",
];

describe("sortRetailersForPlatform", () => {
  it("puts apple_books first on iOS", () => {
    const sorted = sortRetailersForPlatform(ALL_US_RETAILERS, true);
    expect(sorted[0]).toBe("apple_books");
  });

  it("does not reorder retailers on non-iOS", () => {
    const sorted = sortRetailersForPlatform(ALL_US_RETAILERS, false);
    expect(sorted).toEqual(ALL_US_RETAILERS);
  });

  it("preserves all retailers on iOS", () => {
    const sorted = sortRetailersForPlatform(ALL_US_RETAILERS, true);
    expect(sorted).toHaveLength(ALL_US_RETAILERS.length);
    for (const r of ALL_US_RETAILERS) {
      expect(sorted).toContain(r);
    }
  });

  it("handles retailers without apple_books on iOS gracefully", () => {
    const retailers: AffiliateRetailer[] = ["bookshop", "amazon", "audible"];
    const sorted = sortRetailersForPlatform(retailers, true);
    expect(sorted).toEqual(retailers);
  });

  it("apple_books is first and remaining order is preserved on iOS", () => {
    const retailers: AffiliateRetailer[] = [
      "bookshop",
      "amazon",
      "audible",
      "apple_books",
    ];
    const sorted = sortRetailersForPlatform(retailers, true);
    expect(sorted[0]).toBe("apple_books");
    const rest = sorted.slice(1);
    expect(rest).toEqual(["bookshop", "amazon", "audible"]);
  });
});
