import { describe, it, expect } from "vitest";
import { fetchBookDetailRecommendations } from "./fetchBookDetailRecommendations";

describe("fetchBookDetailRecommendations (P-07, #143)", () => {
  it("returns an empty array until the native tRPC client is wired", async () => {
    const recs = await fetchBookDetailRecommendations(
      "00000000-0000-0000-0000-0000000000aa",
    );
    expect(recs).toEqual([]);
  });

  it("accepts any string bookId without throwing (seam for the wired caller)", async () => {
    await expect(fetchBookDetailRecommendations("")).resolves.toEqual([]);
    await expect(
      fetchBookDetailRecommendations("00000000-0000-0000-0000-0000000000bb"),
    ).resolves.toEqual([]);
  });
});
