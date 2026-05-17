import { describe, it, expect } from "vitest";
import { DEFAULT_NAV_ITEMS, type NavItem, type NavProps } from "./navItems";

describe("Nav contract (P-07, #143)", () => {
  it("ships a Discover entry in the default items", () => {
    const discover = DEFAULT_NAV_ITEMS.find((item) => item.href === "/discover");
    expect(discover).toBeDefined();
    expect(discover?.label).toBe("Discover");
  });

  it("preserves order: Home before Discover", () => {
    const hrefs = DEFAULT_NAV_ITEMS.map((item) => item.href);
    const home = hrefs.indexOf("/");
    const discover = hrefs.indexOf("/discover");
    expect(home).toBeGreaterThanOrEqual(0);
    expect(discover).toBeGreaterThan(home);
  });

  it("accepts custom items and a currentPath", () => {
    const items: NavItem[] = [
      { href: "/", label: "Home" },
      { href: "/discover", label: "Discover" },
      { href: "/settings", label: "Settings" },
    ];
    const props: NavProps = { items, currentPath: "/discover" };
    expect(props.items).toHaveLength(3);
    expect(props.currentPath).toBe("/discover");
  });

  it("currentPath is optional", () => {
    const props: NavProps = {};
    expect(props.currentPath).toBeUndefined();
  });

  it("matches the web Nav default items shape (parity)", () => {
    expect(DEFAULT_NAV_ITEMS.map((i) => i.href)).toEqual([
      "/",
      "/discover",
      "/search",
    ]);
    expect(DEFAULT_NAV_ITEMS.map((i) => i.label)).toEqual([
      "Home",
      "Discover",
      "Search",
    ]);
  });

  it("ships a Search entry in the default items (G-03, #77)", () => {
    const search = DEFAULT_NAV_ITEMS.find((item) => item.href === "/search");
    expect(search).toBeDefined();
    expect(search?.label).toBe("Search");
  });
});
