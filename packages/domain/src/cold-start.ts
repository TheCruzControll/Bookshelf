/**
 * Cold-start recommendation ladder (P-05, #141).
 *
 * When a viewer has insufficient signal to drive the main rec pipeline
 * (<3 mutuals OR <10 ranked books), this module supplies a "Popular reads to
 * get you started" fallback by walking a three-rung ladder:
 *
 *   1. popular-on-Hone  — globally popular books on the platform
 *   2. editorial picks   — a small curated seed list (`./editorial`)
 *   3. OL global popular — Open Library / generic catalog popularity
 *
 * Results are concatenated in ladder order, deduplicated by ISBN-13, and
 * trimmed to the requested limit. Each returned candidate carries a stable
 * `reason` enum value identifying which rung it came from so callers (and
 * the reason-picker from #139) can render an appropriate human label.
 *
 * Pure-ish: this module is hexagonal — all I/O is funneled through the
 * `ColdStartPort` interface. The function itself is deterministic given
 * the port's outputs.
 */

import { EDITORIAL_PICKS, type EditorialPick } from "./editorial";
import type { BookSearchResult, EntityId } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threshold for "enough" social signal to skip the cold-start path. */
export const COLD_START_MIN_MUTUALS = 3;

/** Threshold for "enough" taste signal to skip the cold-start path. */
export const COLD_START_MIN_RANKED = 10;

// ---------------------------------------------------------------------------
// Reason labels
// ---------------------------------------------------------------------------

/**
 * Reason enum for cold-start candidates. Each value identifies the ladder
 * rung the candidate came from so the UI can render an appropriate label.
 */
export type ColdStartReason =
  | "popular_on_hone"
  | "editorial_pick"
  | "open_library_popular";

const COLD_START_REASON_LABELS: Record<ColdStartReason, string> = {
  popular_on_hone: "Popular on Hone",
  editorial_pick: "An editor's pick",
  open_library_popular: "Popular reads to get you started",
};

/**
 * Return a short human-readable label for a cold-start reason enum.
 */
export function coldStartReasonLabel(reason: ColdStartReason): string {
  return COLD_START_REASON_LABELS[reason];
}

// ---------------------------------------------------------------------------
// Public candidate shape
// ---------------------------------------------------------------------------

/**
 * A single cold-start candidate. The shape is wide enough to render in any
 * surface but narrow enough to be built from any of the three sources.
 *
 * `bookId` is set when the candidate maps to a known Hone `books` row
 * (popular-on-Hone). Editorial picks and OL popularity carry only catalog
 * data (`isbn13` + `searchResult`) and leave `bookId` undefined — callers
 * that need a `books` row must resolve / create one via the catalog
 * snapshot pipeline.
 */
export interface ColdStartCandidate {
  /** Internal book id when the candidate maps to a Hone `books` row. */
  bookId?: EntityId;
  /** Canonical ISBN-13 used for deduplication across ladder rungs. */
  isbn13: string;
  /** Title (denormalized for the UI). */
  title: string;
  /** Authors (denormalized for the UI). */
  authors: string[];
  /** Genres if known (used by the human-friendly reason picker). */
  genres: string[];
  /** Catalog snapshot when the candidate came from a catalog source. */
  searchResult?: BookSearchResult;
  /** Which ladder rung produced this candidate. */
  reason: ColdStartReason;
}

// ---------------------------------------------------------------------------
// Port — implemented by the data / catalog layers
// ---------------------------------------------------------------------------

/**
 * Hone-side aggregate for a popular book. The cold-start ladder asks the
 * data layer for the top N globally-popular books, excluding any the
 * viewer has already engaged with (ranked or on a shelf).
 */
export interface PopularBookOnHone {
  bookId: EntityId;
  isbn13: string;
  title: string;
  authors: string[];
  /** Total Hone users who have finished this book. */
  finishedCount: number;
  /** Optional canonical genres. */
  genres?: string[];
}

/**
 * Port the cold-start service depends on. Implementations live in the data
 * (db) and catalog adapters.
 */
export interface ColdStartPort {
  /** Mutual-follow count for the viewer. */
  countViewerMutuals(viewerId: EntityId): Promise<number>;
  /** Number of books the viewer has ranked. */
  countViewerRankedBooks(viewerId: EntityId): Promise<number>;
  /**
   * Set of ISBN-13s the viewer has already interacted with — either ranked
   * or currently on any of their shelves. Used to skip cold-start
   * candidates the viewer already knows.
   */
  getViewerKnownIsbn13s(viewerId: EntityId): Promise<Set<string>>;
  /**
   * Top N globally-popular books on Hone (by finished count), excluding
   * the given ISBN-13s. The data layer is expected to perform the
   * aggregation and the ISBN-based exclusion in SQL.
   */
  getPopularOnHone(input: {
    excludeIsbn13s: Set<string>;
    limit: number;
  }): Promise<PopularBookOnHone[]>;
  /**
   * Top N globally-popular books from the upstream catalog (Open Library
   * "popular"/"trending" endpoint or equivalent). Returns canonical
   * `BookSearchResult` shapes.
   */
  getCatalogPopular(input: { limit: number }): Promise<BookSearchResult[]>;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface ColdStartLadderInput {
  viewerId: EntityId;
  /** Maximum number of candidates to return. */
  limit: number;
  /** Optional override for the editorial seed list (defaults to the bundled list). */
  editorialPicks?: ReadonlyArray<EditorialPick>;
}

// ---------------------------------------------------------------------------
// Cold-start detector
// ---------------------------------------------------------------------------

/**
 * Return true when the viewer has insufficient signal for the main rec
 * pipeline: <3 mutuals OR <10 ranked books.
 *
 * Both counts are fetched in parallel from the port.
 */
export async function isColdStart(
  port: ColdStartPort,
  viewerId: EntityId,
): Promise<boolean> {
  const [mutuals, ranked] = await Promise.all([
    port.countViewerMutuals(viewerId),
    port.countViewerRankedBooks(viewerId),
  ]);
  return mutuals < COLD_START_MIN_MUTUALS || ranked < COLD_START_MIN_RANKED;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeIsbn13(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[-\s]/g, "");
  // Allow ISBN-13s only; ISBN-10s are kept in their own slot upstream.
  if (cleaned.length !== 13) return null;
  return cleaned;
}

function popularToCandidate(b: PopularBookOnHone): ColdStartCandidate {
  return {
    bookId: b.bookId,
    isbn13: b.isbn13,
    title: b.title,
    authors: b.authors,
    genres: b.genres ?? [],
    reason: "popular_on_hone",
  };
}

function editorialToCandidate(p: EditorialPick): ColdStartCandidate {
  return {
    isbn13: p.isbn13,
    title: p.title,
    authors: p.authors,
    genres: p.genres ?? [],
    reason: "editorial_pick",
  };
}

function searchResultToCandidate(
  r: BookSearchResult,
  isbn13: string,
): ColdStartCandidate {
  return {
    isbn13,
    title: r.title,
    authors: r.authors,
    genres: r.genres ?? [],
    searchResult: r,
    reason: "open_library_popular",
  };
}

// ---------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------

/**
 * Walk the cold-start ladder and return up to `limit` deduplicated
 * candidates. The ladder rungs are walked in order; later rungs only
 * contribute candidates whose ISBN-13 hasn't already been collected.
 *
 * The caller decides when to invoke this (via {@link isColdStart}); this
 * function itself is unconditional — it always builds the ladder result.
 */
export async function buildColdStartLadder(
  port: ColdStartPort,
  input: ColdStartLadderInput,
): Promise<ColdStartCandidate[]> {
  const { viewerId, limit } = input;
  if (limit <= 0) return [];

  const editorial = input.editorialPicks ?? EDITORIAL_PICKS;

  // Step 1 — gather the viewer's exclusion set (known ISBN-13s).
  const known = await port.getViewerKnownIsbn13s(viewerId);

  // We over-fetch slightly from each upstream rung to absorb dedup losses,
  // but never less than the requested limit. The catalog tier is the most
  // expensive, so we don't over-fetch it.
  const fetchLimit = Math.max(limit, limit + 5);

  // Step 2 — rung 1: popular on Hone.
  // The data layer already excludes by ISBN-13 in SQL, but we re-apply
  // exclusion in JS so the contract is robust to thin/stale adapters.
  const popular = await port.getPopularOnHone({
    excludeIsbn13s: known,
    limit: fetchLimit,
  });

  const collected: ColdStartCandidate[] = [];
  const seen = new Set<string>(known);

  for (const p of popular) {
    const isbn = normalizeIsbn13(p.isbn13);
    if (!isbn) continue;
    if (seen.has(isbn)) continue;
    seen.add(isbn);
    collected.push(popularToCandidate({ ...p, isbn13: isbn }));
    if (collected.length >= limit) return collected;
  }

  // Step 3 — rung 2: editorial picks.
  for (const pick of editorial) {
    const isbn = normalizeIsbn13(pick.isbn13);
    if (!isbn) continue;
    if (seen.has(isbn)) continue;
    seen.add(isbn);
    collected.push(editorialToCandidate({ ...pick, isbn13: isbn }));
    if (collected.length >= limit) return collected;
  }

  // Step 4 — rung 3: catalog popularity (OL fallback).
  const remaining = limit - collected.length;
  if (remaining <= 0) return collected;

  const catalog = await port.getCatalogPopular({ limit: remaining + 5 });

  for (const r of catalog) {
    const isbn = normalizeIsbn13(r.isbn13);
    if (!isbn) continue;
    if (seen.has(isbn)) continue;
    seen.add(isbn);
    collected.push(searchResultToCandidate(r, isbn));
    if (collected.length >= limit) return collected;
  }

  return collected;
}

// ---------------------------------------------------------------------------
// Convenience: detector + ladder
// ---------------------------------------------------------------------------

/**
 * Outcome of {@link maybeColdStartLadder}. When `isColdStart` is false the
 * caller should fall through to the main rec pipeline; when true,
 * `candidates` holds the cold-start ladder result.
 */
export interface MaybeColdStartResult {
  isColdStart: boolean;
  candidates: ColdStartCandidate[];
}

/**
 * Detect cold-start state and, if active, build the ladder.
 *
 * Returns `{ isColdStart: false, candidates: [] }` when the viewer has
 * enough signal — callers should then run the main rec pipeline.
 */
export async function maybeColdStartLadder(
  port: ColdStartPort,
  input: ColdStartLadderInput,
): Promise<MaybeColdStartResult> {
  const cold = await isColdStart(port, input.viewerId);
  if (!cold) return { isColdStart: false, candidates: [] };
  const candidates = await buildColdStartLadder(port, input);
  return { isColdStart: true, candidates };
}
