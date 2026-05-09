import { describe, it, expect } from "vitest";
import sitemap, { revalidate } from "./sitemap";

describe("sitemap", () => {
  it("revalidates daily (86400 seconds)", () => {
    expect(revalidate).toBe(86400);
  });

  it("includes the home URL", async () => {
    const entries = await sitemap();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://honebooks.app";
    const home = entries.find((e) => e.url === baseUrl);
    expect(home).toBeDefined();
    expect(home?.priority).toBe(1.0);
  });

  it("returns an array of sitemap entries", async () => {
    const entries = await sitemap();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it("all entries have valid url strings", async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      expect(typeof entry.url).toBe("string");
      expect(entry.url.startsWith("http")).toBe(true);
    }
  });
});
