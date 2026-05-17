import { describe, it, expect } from "vitest";
import { DEFAULT_NAV_ITEMS } from "../components/Nav";

describe("/import page (K-07, #106)", () => {
  it("Import is registered in the default top-level nav", () => {
    const importEntry = DEFAULT_NAV_ITEMS.find(
      (item) => item.href === "/import",
    );
    expect(importEntry).toBeDefined();
    expect(importEntry?.label).toBe("Import");
  });

  it("Import sits after Search in the nav (left-to-right reading order)", () => {
    const hrefs = DEFAULT_NAV_ITEMS.map((item) => item.href);
    const search = hrefs.indexOf("/search");
    const imp = hrefs.indexOf("/import");
    expect(search).toBeGreaterThanOrEqual(0);
    expect(imp).toBeGreaterThan(search);
  });
});
