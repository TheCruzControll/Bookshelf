import { describe, it, expect } from "vitest";
import { fetchSearchResults } from "./fetchSearchResults";

describe("fetchSearchResults (native, G-03, #77)", () => {
  it("returns an empty list for an empty query", async () => {
    const results = await fetchSearchResults("");
    expect(results).toEqual([]);
  });

  it("returns an empty list for a whitespace query", async () => {
    const results = await fetchSearchResults("   ");
    expect(results).toEqual([]);
  });

  it("returns an empty list for ISBN input (tRPC client not wired yet)", async () => {
    const isbn = await fetchSearchResults("9780553293357");
    expect(isbn).toEqual([]);
  });

  it("returns an empty list for free-text input (tRPC client not wired yet)", async () => {
    const text = await fetchSearchResults("Foundation");
    expect(text).toEqual([]);
  });

  it("returns a list type that the Search screen can map over", async () => {
    const results = await fetchSearchResults("");
    expect(Array.isArray(results)).toBe(true);
  });
});
