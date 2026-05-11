import { describe, it, expect, vi } from "vitest";
import { queryCandidates } from "./candidate-query";
import type { CandidateBook, CandidateQueryPort } from "./candidate-query";

function makeCandidate(overrides: Partial<CandidateBook> = {}): CandidateBook {
  return {
    bookId: "book-1",
    networkFinishedCount: 0,
    popularityCount: 0,
    genres: [],
    ...overrides,
  };
}

function makeMockPort(overrides: Partial<CandidateQueryPort> = {}): CandidateQueryPort {
  return {
    getPopularBooks: vi.fn().mockResolvedValue([]),
    getNetworkBooks: vi.fn().mockResolvedValue([]),
    getGenreOverlapBooks: vi.fn().mockResolvedValue([]),
    getFinishedBookIds: vi.fn().mockResolvedValue(new Set()),
    getBlockedUserIds: vi.fn().mockResolvedValue(new Set()),
    getViewerTopGenres: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("queryCandidates", () => {
  const viewerId = "viewer-1";

  it("returns empty array when all sources return nothing", async () => {
    const port = makeMockPort();
    const result = await queryCandidates(port, { viewerId, limit: 10 });
    expect(result).toEqual([]);
  });

  it("returns top-K candidates limited by the input limit", async () => {
    const candidates: CandidateBook[] = Array.from({ length: 20 }, (_, i) =>
      makeCandidate({
        bookId: `book-${i}`,
        popularityCount: 20 - i,
      })
    );
    const port = makeMockPort({
      getPopularBooks: vi.fn().mockResolvedValue(candidates),
    });

    const result = await queryCandidates(port, { viewerId, limit: 5 });
    expect(result).toHaveLength(5);
  });

  it("excludes books the viewer has already finished", async () => {
    const port = makeMockPort({
      getFinishedBookIds: vi.fn().mockResolvedValue(new Set(["book-finished"])),
      getPopularBooks: vi.fn().mockResolvedValue([
        makeCandidate({ bookId: "book-1", popularityCount: 10 }),
      ]),
    });

    const result = await queryCandidates(port, { viewerId, limit: 10 });

    // Verify the port was called with the exclusion set
    expect(port.getPopularBooks).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeBookIds: new Set(["book-finished"]),
      })
    );
    // The returned candidates don't include finished books
    expect(result.every((c) => c.bookId !== "book-finished")).toBe(true);
  });

  it("passes blocked user IDs to network query", async () => {
    const blockedIds = new Set(["blocked-user-1", "blocked-user-2"]);
    const port = makeMockPort({
      getBlockedUserIds: vi.fn().mockResolvedValue(blockedIds),
    });

    await queryCandidates(port, { viewerId, limit: 10 });

    expect(port.getNetworkBooks).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeUserIds: blockedIds,
      })
    );
  });

  it("deduplicates books appearing in multiple sources", async () => {
    const popularBook = makeCandidate({
      bookId: "book-dup",
      popularityCount: 50,
      networkFinishedCount: 0,
      genres: ["fantasy"],
    });
    const networkBook = makeCandidate({
      bookId: "book-dup",
      popularityCount: 10,
      networkFinishedCount: 3,
      genres: ["sci-fi"],
    });

    const port = makeMockPort({
      getPopularBooks: vi.fn().mockResolvedValue([popularBook]),
      getNetworkBooks: vi.fn().mockResolvedValue([networkBook]),
    });

    const result = await queryCandidates(port, { viewerId, limit: 10 });

    expect(result).toHaveLength(1);
    expect(result[0]!.bookId).toBe("book-dup");
    // Merged: takes max of each count
    expect(result[0]!.popularityCount).toBe(50);
    expect(result[0]!.networkFinishedCount).toBe(3);
    // Union of genres
    expect(result[0]!.genres).toContain("fantasy");
    expect(result[0]!.genres).toContain("sci-fi");
  });

  it("ranks candidates by composite score (network*2 + popularity)", async () => {
    const candidates: CandidateBook[] = [
      makeCandidate({ bookId: "low", networkFinishedCount: 0, popularityCount: 5 }),
      makeCandidate({ bookId: "high", networkFinishedCount: 3, popularityCount: 2 }),
      makeCandidate({ bookId: "mid", networkFinishedCount: 1, popularityCount: 4 }),
    ];
    const port = makeMockPort({
      getPopularBooks: vi.fn().mockResolvedValue(candidates),
    });

    const result = await queryCandidates(port, { viewerId, limit: 10 });

    // high: 3*2 + 2 = 8
    // mid: 1*2 + 4 = 6
    // low: 0*2 + 5 = 5
    expect(result.map((c) => c.bookId)).toEqual(["high", "mid", "low"]);
  });

  it("fetches genre overlap books when viewer has genres", async () => {
    const port = makeMockPort({
      getViewerTopGenres: vi.fn().mockResolvedValue(["fantasy", "sci-fi"]),
      getGenreOverlapBooks: vi.fn().mockResolvedValue([
        makeCandidate({ bookId: "genre-book", genres: ["fantasy"], popularityCount: 5 }),
      ]),
    });

    const result = await queryCandidates(port, { viewerId, limit: 10 });

    expect(port.getGenreOverlapBooks).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerGenres: ["fantasy", "sci-fi"],
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.bookId).toBe("genre-book");
  });

  it("skips genre overlap query when viewer has no genres", async () => {
    const port = makeMockPort({
      getViewerTopGenres: vi.fn().mockResolvedValue([]),
      getGenreOverlapBooks: vi.fn().mockResolvedValue([]),
    });

    await queryCandidates(port, { viewerId, limit: 10 });

    expect(port.getGenreOverlapBooks).not.toHaveBeenCalled();
  });

  it("merges candidates from all three sources", async () => {
    const port = makeMockPort({
      getViewerTopGenres: vi.fn().mockResolvedValue(["mystery"]),
      getPopularBooks: vi.fn().mockResolvedValue([
        makeCandidate({ bookId: "popular-1", popularityCount: 20 }),
      ]),
      getNetworkBooks: vi.fn().mockResolvedValue([
        makeCandidate({ bookId: "network-1", networkFinishedCount: 4 }),
      ]),
      getGenreOverlapBooks: vi.fn().mockResolvedValue([
        makeCandidate({ bookId: "genre-1", genres: ["mystery"], popularityCount: 3 }),
      ]),
    });

    const result = await queryCandidates(port, { viewerId, limit: 10 });

    expect(result).toHaveLength(3);
    const bookIds = result.map((c) => c.bookId);
    expect(bookIds).toContain("popular-1");
    expect(bookIds).toContain("network-1");
    expect(bookIds).toContain("genre-1");
  });

  it("requests 2x limit from each source to account for dedup", async () => {
    const port = makeMockPort();
    await queryCandidates(port, { viewerId, limit: 10 });

    expect(port.getPopularBooks).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 })
    );
    expect(port.getNetworkBooks).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 })
    );
  });

  it("passes viewerId to network and exclusion queries", async () => {
    const port = makeMockPort();
    await queryCandidates(port, { viewerId: "user-abc", limit: 10 });

    expect(port.getFinishedBookIds).toHaveBeenCalledWith("user-abc");
    expect(port.getBlockedUserIds).toHaveBeenCalledWith("user-abc");
    expect(port.getViewerTopGenres).toHaveBeenCalledWith("user-abc", 5);
    expect(port.getNetworkBooks).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: "user-abc" })
    );
  });
});
