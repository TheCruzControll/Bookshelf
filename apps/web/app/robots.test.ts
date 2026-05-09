import { describe, it, expect } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("returns a robots configuration object", () => {
    const result = robots();
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  it("includes a sitemap URL", () => {
    const result = robots();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://honebooks.app";
    expect(result.sitemap).toBe(`${baseUrl}/sitemap.xml`);
  });

  it("has at least one rule", () => {
    const result = robots();
    expect(Array.isArray(result.rules)).toBe(true);
    const rules = result.rules as Array<{ userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[]; crawlDelay?: number }>;
    expect(rules.length).toBeGreaterThanOrEqual(1);
  });

  it("allows public pages", () => {
    const result = robots();
    const rules = result.rules as Array<{ userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }>;
    const allowedPaths = rules.flatMap((r) =>
      Array.isArray(r.allow) ? r.allow : r.allow ? [r.allow] : []
    );
    expect(allowedPaths).toContain("/");
    expect(allowedPaths).toContain("/u/");
    expect(allowedPaths).toContain("/books/");
  });

  it("disallows settings pages", () => {
    const result = robots();
    const rules = result.rules as Array<{ userAgent?: string | string[]; disallow?: string | string[] }>;
    const disallowedPaths = rules.flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : []
    );
    expect(disallowedPaths.some((p) => p.startsWith("/settings"))).toBe(true);
  });

  it("disallows onboarding pages", () => {
    const result = robots();
    const rules = result.rules as Array<{ userAgent?: string | string[]; disallow?: string | string[] }>;
    const disallowedPaths = rules.flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : []
    );
    expect(disallowedPaths.some((p) => p.startsWith("/onboarding"))).toBe(true);
  });

  it("disallows draft pages", () => {
    const result = robots();
    const rules = result.rules as Array<{ userAgent?: string | string[]; disallow?: string | string[] }>;
    const disallowedPaths = rules.flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : []
    );
    expect(disallowedPaths.some((p) => p.startsWith("/draft"))).toBe(true);
  });

  it("sets crawl-delay for followers and following paths", () => {
    const result = robots();
    const rules = result.rules as Array<{ userAgent?: string | string[]; allow?: string | string[]; crawlDelay?: number }>;
    const crawlDelayRule = rules.find((r) => r.crawlDelay !== undefined);
    expect(crawlDelayRule).toBeDefined();
    expect(crawlDelayRule?.crawlDelay).toBeGreaterThan(0);
    const allowedPaths = Array.isArray(crawlDelayRule?.allow)
      ? crawlDelayRule.allow
      : crawlDelayRule?.allow
      ? [crawlDelayRule.allow]
      : [];
    expect(allowedPaths.some((p) => p.includes("followers"))).toBe(true);
    expect(allowedPaths.some((p) => p.includes("following"))).toBe(true);
  });
});
