import { describe, it, expect } from "vitest";
import { DEFAULT_NAV_ITEMS, type NavItem, type NavProps } from "./Nav";

describe("Nav contract (P-06, #142)", () => {
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
});
