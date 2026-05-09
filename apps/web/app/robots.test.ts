import { describe, it, expect } from "vitest";
import robots from "./robots";

interface RobotRule {
  userAgent?: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
  crawlDelay?: number;
}

function getRulesArray(rules: unknown): RobotRule[] {
  if (!rules) return [];
  if (Array.isArray(rules)) return rules as RobotRule[];
  return [rules as RobotRule];
}

describe("robots", () => {
  it("returns an object with rules and sitemap", () => {
    const result = robots();
    expect(result).toHaveProperty("rules");
    expect(result).toHaveProperty("sitemap");
  });

  it("disallows settings, account, onboarding, draft, search paths", () => {
    const result = robots();
    const rules = getRulesArray(result.rules);
    const allDisallowed = rules.flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : []
    );
    expect(allDisallowed).toContain("/settings");
    expect(allDisallowed).toContain("/account");
    expect(allDisallowed).toContain("/onboarding");
    expect(allDisallowed).toContain("/draft");
    expect(allDisallowed).toContain("/search");
  });

  it("allows public profile and book paths", () => {
    const result = robots();
    const rules = getRulesArray(result.rules);
    const allAllowed = rules.flatMap((r) =>
      Array.isArray(r.allow) ? r.allow : r.allow ? [r.allow] : []
    );
    expect(allAllowed).toContain("/u/");
    expect(allAllowed).toContain("/books/");
  });

  it("applies crawl-delay to followers and following pages", () => {
    const result = robots();
    const rules = getRulesArray(result.rules);
    const crawlDelayRules = rules.filter((r) => r.crawlDelay !== undefined);
    expect(crawlDelayRules.length).toBeGreaterThanOrEqual(1);
    const crawlDelayAllowed = crawlDelayRules.flatMap((r) =>
      Array.isArray(r.allow) ? r.allow : r.allow ? [r.allow] : []
    );
    expect(crawlDelayAllowed.some((path) => path.includes("followers") || path.includes("following"))).toBe(true);
  });

  it("sitemap points to the sitemap.xml URL", () => {
    const result = robots();
    const sitemap = typeof result.sitemap === "string" ? result.sitemap : "";
    expect(sitemap).toMatch(/sitemap\.xml$/);
  });
});
