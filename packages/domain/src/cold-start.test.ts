import { describe, expect, it, vi } from "vitest";

import {
  buildColdStartLadder,
  COLD_START_MIN_MUTUALS,
  COLD_START_MIN_RANKED,
  coldStartReasonLabel,
  isColdStart,
  maybeColdStartLadder,
  type ColdStartCandidate,
  type ColdStartPort,
  type PopularBookOnHone,
} from "./cold-start";
import { EDITORIAL_PICKS, type EditorialPick } from "./editorial";
import type { BookSearchResult } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePopular(overrides: Partial<PopularBookOnHone> = {}): PopularBookOnHone {
  return {
    bookId: "book-hone-1",
    isbn13: "9781111111111",
    title: "Hone Popular",
    authors: ["Author A"],
    finishedCount: 10,
    genres: ["fiction"],
    ...overrides,
  };
}

function makeSearchResult(overrides: Partial<BookSearchResult> = {}): BookSearchResult {
  return {
    source: "open_library",
    sourceKey: "/works/OL1W",
    title: "Catalog Popular",
    authors: ["Author B"],
    isbn13: "9782222222222",
    genres: ["non-fiction"],
    ...overrides,
  };
}

function makePort(overrides: Partial<ColdStartPort> = {}): ColdStartPort {
  return {
    countViewerMutuals: vi.fn().mockResolvedValue(0),
    countViewerRankedBooks: vi.fn().mockResolvedValue(0),
    getViewerKnownIsbn13s: vi.fn().mockResolvedValue(new Set<string>()),
    getPopularOnHone: vi.fn().mockResolvedValue([]),
    getCatalogPopular: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const viewerId = "viewer-1";

// ---------------------------------------------------------------------------
// isColdStart detector
// ---------------------------------------------------------------------------

describe("isColdStart", () => {
  it("returns true for viewer with 0 mutuals and 0 ranked books", async () => {
    const port = makePort({
      countViewerMutuals: vi.fn().mockResolvedValue(0),
      countViewerRankedBooks: vi.fn().mockResolvedValue(0),
    });
    await expect(isColdStart(port, viewerId)).resolves.toBe(true);
  });

  it("returns true when below mutuals threshold even with many ranked", async () => {
    const port = makePort({
      countViewerMutuals: vi.fn().mockResolvedValue(COLD_START_MIN_MUTUALS - 1),
      countViewerRankedBooks: vi.fn().mockResolvedValue(100),
    });
    await expect(isColdStart(port, viewerId)).resolves.toBe(true);
  });

  it("returns true when below ranked threshold even with many mutuals", async () => {
    // PRD: viewer with 3 mutuals + 0 ranked → still cold-start.
    const port = makePort({
      countViewerMutuals: vi.fn().mockResolvedValue(COLD_START_MIN_MUTUALS),
      countViewerRankedBooks: vi.fn().mockResolvedValue(0),
    });
    await expect(isColdStart(port, viewerId)).resolves.toBe(true);
  });

  it("returns false when both thresholds are met", async () => {
    // PRD: viewer with 3 mutuals + 10 ranked → NOT cold-start.
    const port = makePort({
      countViewerMutuals: vi.fn().mockResolvedValue(COLD_START_MIN_MUTUALS),
      countViewerRankedBooks: vi.fn().mockResolvedValue(COLD_START_MIN_RANKED),
    });
    await expect(isColdStart(port, viewerId)).resolves.toBe(false);
  });

  it("returns false when both counts greatly exceed the thresholds", async () => {
    const port = makePort({
      countViewerMutuals: vi.fn().mockResolvedValue(42),
      countViewerRankedBooks: vi.fn().mockResolvedValue(99),
    });
    await expect(isColdStart(port, viewerId)).resolves.toBe(false);
  });

  it("queries both signals in parallel", async () => {
    const mutuals = vi.fn().mockResolvedValue(0);
    const ranked = vi.fn().mockResolvedValue(0);
    const port = makePort({
      countViewerMutuals: mutuals,
      countViewerRankedBooks: ranked,
    });
    await isColdStart(port, viewerId);
    expect(mutuals).toHaveBeenCalledTimes(1);
    expect(ranked).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// buildColdStartLadder
// ---------------------------------------------------------------------------

describe("buildColdStartLadder", () => {
  it("uses popular-on-Hone first when available", async () => {
    const popular = [
      makePopular({ bookId: "b1", isbn13: "9780000000001", title: "P1" }),
      makePopular({ bookId: "b2", isbn13: "9780000000002", title: "P2" }),
      makePopular({ bookId: "b3", isbn13: "9780000000003", title: "P3" }),
    ];
    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue(popular),
    });

    const result = await buildColdStartLadder(port, { viewerId, limit: 3 });

    expect(result).toHaveLength(3);
    expect(result.every((c) => c.reason === "popular_on_hone")).toBe(true);
    expect(result.map((c) => c.isbn13)).toEqual([
      "9780000000001",
      "9780000000002",
      "9780000000003",
    ]);
    // Catalog should not have been called when popular-on-Hone fills the limit.
    expect(port.getCatalogPopular).not.toHaveBeenCalled();
  });

  it("falls back to editorial picks when popular-on-Hone yields nothing", async () => {
    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue([]),
    });

    const result = await buildColdStartLadder(port, { viewerId, limit: 3 });

    expect(result).toHaveLength(3);
    expect(result.every((c) => c.reason === "editorial_pick")).toBe(true);
    // All ISBNs should come from the bundled editorial picks.
    const editorialIsbns = new Set(EDITORIAL_PICKS.map((p) => p.isbn13));
    expect(result.every((c) => editorialIsbns.has(c.isbn13))).toBe(true);
  });

  it("includes editorial picks alongside popular-on-Hone when popular runs short", async () => {
    const popular = [makePopular({ isbn13: "9780000000010" })];
    const editorial: EditorialPick[] = [
      { isbn13: "9780000000020", title: "Ed 1", authors: ["E1"] },
      { isbn13: "9780000000021", title: "Ed 2", authors: ["E2"] },
    ];
    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue(popular),
    });

    const result = await buildColdStartLadder(port, {
      viewerId,
      limit: 5,
      editorialPicks: editorial,
    });

    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result[0]?.reason).toBe("popular_on_hone");
    expect(result[1]?.reason).toBe("editorial_pick");
    expect(result[2]?.reason).toBe("editorial_pick");
  });

  it("falls back to OL global popularity when popular and editorial yield nothing", async () => {
    const catalog = [
      makeSearchResult({ isbn13: "9781000000001", title: "OL 1" }),
      makeSearchResult({ isbn13: "9781000000002", title: "OL 2" }),
    ];
    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue([]),
      getCatalogPopular: vi.fn().mockResolvedValue(catalog),
    });

    const result = await buildColdStartLadder(port, {
      viewerId,
      limit: 2,
      editorialPicks: [],
    });

    expect(result).toHaveLength(2);
    expect(result.every((c) => c.reason === "open_library_popular")).toBe(true);
    expect(result[0]?.isbn13).toBe("9781000000001");
    expect(result[1]?.isbn13).toBe("9781000000002");
  });

  it("dedupes by ISBN-13 across ladder rungs", async () => {
    const sharedIsbn = "9789999999999";
    const popular = [makePopular({ isbn13: sharedIsbn, title: "Shared" })];
    const editorial: EditorialPick[] = [
      { isbn13: sharedIsbn, title: "Shared editorial", authors: ["E"] },
      { isbn13: "9787777777777", title: "Unique editorial", authors: ["E2"] },
    ];
    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue(popular),
    });

    const result = await buildColdStartLadder(port, {
      viewerId,
      limit: 5,
      editorialPicks: editorial,
    });

    const isbns = result.map((c) => c.isbn13);
    expect(new Set(isbns).size).toBe(isbns.length);
    // The shared ISBN should appear only once — and only as popular-on-Hone
    // since that rung runs first.
    const shared = result.filter((c) => c.isbn13 === sharedIsbn);
    expect(shared).toHaveLength(1);
    expect(shared[0]?.reason).toBe("popular_on_hone");
  });

  it("excludes candidates that the viewer already knows", async () => {
    const knownIsbn = "9780000000050";
    const popular = [
      makePopular({ isbn13: knownIsbn, title: "Already known" }),
      makePopular({ isbn13: "9780000000051", title: "Fresh" }),
    ];
    const port = makePort({
      getViewerKnownIsbn13s: vi.fn().mockResolvedValue(new Set([knownIsbn])),
      getPopularOnHone: vi.fn().mockResolvedValue(popular),
    });

    const result = await buildColdStartLadder(port, {
      viewerId,
      limit: 5,
      editorialPicks: [],
    });

    expect(result.find((c) => c.isbn13 === knownIsbn)).toBeUndefined();
    expect(result.find((c) => c.isbn13 === "9780000000051")).toBeDefined();
    // The port must receive the exclusion set so it can also filter in SQL.
    expect(port.getPopularOnHone).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeIsbn13s: new Set([knownIsbn]),
      }),
    );
  });

  it("returns at most `limit` candidates", async () => {
    const popular = Array.from({ length: 50 }, (_, i) =>
      makePopular({
        bookId: `b${i}`,
        isbn13: `978000${String(i).padStart(7, "0")}`,
      }),
    );
    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue(popular),
    });

    const result = await buildColdStartLadder(port, { viewerId, limit: 7 });
    expect(result).toHaveLength(7);
  });

  it("returns an empty list when limit is zero", async () => {
    const port = makePort();
    await expect(
      buildColdStartLadder(port, { viewerId, limit: 0 }),
    ).resolves.toEqual([]);
  });

  it("ignores popular entries with malformed ISBN-13s", async () => {
    const popular = [
      makePopular({ isbn13: "not-an-isbn" }),
      makePopular({ isbn13: "9780000000099", title: "Valid" }),
    ];
    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue(popular),
    });

    const result = await buildColdStartLadder(port, {
      viewerId,
      limit: 5,
      editorialPicks: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.isbn13).toBe("9780000000099");
  });

  it("does not call getCatalogPopular when the ladder is full", async () => {
    const popular = Array.from({ length: 5 }, (_, i) =>
      makePopular({
        bookId: `b${i}`,
        isbn13: `978000${String(i).padStart(7, "0")}`,
      }),
    );
    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue(popular),
    });

    await buildColdStartLadder(port, { viewerId, limit: 5 });
    expect(port.getCatalogPopular).not.toHaveBeenCalled();
  });

  it("attaches the catalog snapshot on OL candidates so callers can resolve a book row", async () => {
    const snapshot = makeSearchResult({ isbn13: "9781000000007", title: "Snap" });
    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue([]),
      getCatalogPopular: vi.fn().mockResolvedValue([snapshot]),
    });

    const result = await buildColdStartLadder(port, {
      viewerId,
      limit: 1,
      editorialPicks: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.searchResult).toEqual(snapshot);
    expect(result[0]?.reason).toBe("open_library_popular");
  });
});

// ---------------------------------------------------------------------------
// maybeColdStartLadder
// ---------------------------------------------------------------------------

describe("maybeColdStartLadder", () => {
  it("returns empty candidates when viewer is not cold-start", async () => {
    const port = makePort({
      countViewerMutuals: vi.fn().mockResolvedValue(COLD_START_MIN_MUTUALS),
      countViewerRankedBooks: vi.fn().mockResolvedValue(COLD_START_MIN_RANKED),
      // These should not be consulted, but supply data to prove the
      // function short-circuits before walking the ladder.
      getPopularOnHone: vi.fn().mockResolvedValue([makePopular()]),
    });

    const result = await maybeColdStartLadder(port, { viewerId, limit: 5 });

    expect(result.isColdStart).toBe(false);
    expect(result.candidates).toEqual([]);
    expect(port.getPopularOnHone).not.toHaveBeenCalled();
    expect(port.getCatalogPopular).not.toHaveBeenCalled();
  });

  it("walks the ladder when viewer is cold-start", async () => {
    const popular = [makePopular({ isbn13: "9780000000200" })];
    const port = makePort({
      countViewerMutuals: vi.fn().mockResolvedValue(0),
      countViewerRankedBooks: vi.fn().mockResolvedValue(0),
      getPopularOnHone: vi.fn().mockResolvedValue(popular),
    });

    const result = await maybeColdStartLadder(port, { viewerId, limit: 3 });

    expect(result.isColdStart).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]?.reason).toBe("popular_on_hone");
  });
});

// ---------------------------------------------------------------------------
// Reason labels
// ---------------------------------------------------------------------------

describe("coldStartReasonLabel", () => {
  it("returns a label for popular-on-Hone candidates", () => {
    expect(coldStartReasonLabel("popular_on_hone")).toMatch(/Hone/i);
  });

  it("returns a label for editorial picks", () => {
    expect(coldStartReasonLabel("editorial_pick")).toMatch(/editor/i);
  });

  it("returns a label for OL popular candidates that reflects the cold-start state", () => {
    expect(coldStartReasonLabel("open_library_popular")).toMatch(
      /popular reads to get you started/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Editorial picks integrity
// ---------------------------------------------------------------------------

describe("editorial picks", () => {
  it("ships with enough entries to fill a typical cold-start surface", () => {
    expect(EDITORIAL_PICKS.length).toBeGreaterThanOrEqual(20);
  });

  it("flags each entry as an editorial_pick when threaded through the ladder", async () => {
    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue([]),
      getCatalogPopular: vi.fn().mockResolvedValue([]),
    });
    const result = await buildColdStartLadder(port, { viewerId, limit: 1 });
    expect(result[0]?.reason).toBe("editorial_pick");
  });
});

// ---------------------------------------------------------------------------
// Cross-rung reason coverage
// ---------------------------------------------------------------------------

describe("reason labels across the ladder", () => {
  it("each rung produces candidates with the correct reason enum", async () => {
    const popular = [makePopular({ isbn13: "9780000000300", title: "P" })];
    const editorial: EditorialPick[] = [
      { isbn13: "9780000000301", title: "E", authors: ["a"] },
    ];
    const catalog = [makeSearchResult({ isbn13: "9780000000302", title: "C" })];

    const port = makePort({
      getPopularOnHone: vi.fn().mockResolvedValue(popular),
      getCatalogPopular: vi.fn().mockResolvedValue(catalog),
    });

    const result = await buildColdStartLadder(port, {
      viewerId,
      limit: 3,
      editorialPicks: editorial,
    });

    const reasons: ColdStartCandidate["reason"][] = result.map((c) => c.reason);
    expect(reasons).toContain("popular_on_hone");
    expect(reasons).toContain("editorial_pick");
    expect(reasons).toContain("open_library_popular");
  });
});
