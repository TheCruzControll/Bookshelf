/**
 * Search re-ranker (F-07, #73).
 *
 * Layered re-rank over the catalog provider's default ordering (Open Library
 * Solr default for OL hits, Google Books default for GB hits). The provider
 * order is preserved as a stable tie-breaker via the input array index, so
 * results that the upstream already considered "best" keep their relative
 * advantage when our boosts don't fire.
 *
 * Signals (per #73 acceptance criteria):
 *   1. Exact title match — query == result.title (case-insensitive, trimmed).
 *   2. Exact author match — any query token appears as an exact author name.
 *   3. Edition count — log-scaled so a work with 50 editions outranks one
 *      with 5, without letting a single mega-popular work dominate.
 *   4. Locale-language preference — viewer's locale language code matches
 *      one of the result's languages.
 *
 * Tiebreakers (applied in order when total scores tie):
 *   1. `firstPublishedYear` descending (newer wins).
 *   2. Original provider order (stable sort guarantee).
 *
 * Pure function — no I/O, no ports. Safe to call from anywhere.
 */

import type { BookSearchResult } from "./types";

// ---------------------------------------------------------------------------
// Tunable weights
// ---------------------------------------------------------------------------

/**
 * Hand-tuned weights. The values are chosen so that:
 *   - An exact title match alone (W_EXACT_TITLE = 5.0) outranks anything
 *     reachable by combining the other three boosts on a non-exact result
 *     (max ≈ 3.0 + 2.0 + 1.0 = 6.0 in theory, but EDITION_COUNT_LOG_MAX is
 *     capped so the realistic combined max is ≈ 4.2 — comfortably below 5.0).
 *   - Exact author still meaningfully outranks "just popular" results.
 *   - Locale preference is a tiebreaker-class signal, not a dominant one.
 *
 * Exposed so tests can pin specific expectations against them.
 */
export const SEARCH_RANK_WEIGHTS = {
  exactTitle: 5.0,
  exactAuthor: 3.0,
  editionCountScale: 1.0,
  localeMatch: 2.0,
} as const;

/**
 * Saturation point for `editionCount`. A work with this many editions gets
 * the full `editionCountScale` contribution; beyond this, the marginal gain
 * is effectively zero (log saturates).
 */
const EDITION_COUNT_SATURATION = 100;

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Tokenize a query into normalized whitespace-separated tokens. Used to test
 * for exact-author matches when the user typed multiple words (e.g.
 * `"tolkien lord of the rings"` should still author-match Tolkien).
 */
function tokenize(query: string): string[] {
  return normalizeText(query)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Map an arbitrary locale string to a 2-letter language code (lower-cased).
 *
 * Accepts BCP-47 tags (`en-US`, `fr-CA`), bare two-letter codes (`en`), or
 * three-letter ISO 639-2/3 codes (`eng`). Three-letter codes are mapped to
 * their two-letter equivalents for the handful of languages most likely to
 * show up in book catalogs — anything else falls back to its first two
 * characters, which is correct for the major Romance / Germanic / CJK codes
 * (`fre`->`fr` is wrong, but Open Library actually returns the 639-3 code
 * `fre`, so we handle the common cases explicitly).
 *
 * Returns `null` for empty / unrecognized input so the caller can skip the
 * locale-match boost entirely (rather than awarding it spuriously).
 */
function localeToLang(locale: string | undefined): string | null {
  if (!locale) return null;
  const cleaned = locale.trim().toLowerCase();
  if (cleaned.length === 0) return null;

  // BCP-47: take the part before the first separator.
  const primary = cleaned.split(/[-_]/)[0] ?? cleaned;

  if (primary.length === 2) return primary;
  if (primary.length === 3) {
    // ISO 639-2/B and 639-2/T -> 639-1 mapping for languages commonly tagged
    // by Open Library. Not exhaustive — unknown codes fall through to null
    // so we don't false-positive a locale match.
    const map: Record<string, string> = {
      eng: "en",
      fre: "fr",
      fra: "fr",
      ger: "de",
      deu: "de",
      spa: "es",
      ita: "it",
      por: "pt",
      rus: "ru",
      jpn: "ja",
      chi: "zh",
      zho: "zh",
      kor: "ko",
      ara: "ar",
      hin: "hi",
      dut: "nl",
      nld: "nl",
      swe: "sv",
      nor: "no",
      dan: "da",
      fin: "fi",
      pol: "pl",
      tur: "tr",
      heb: "he",
      ell: "el",
      gre: "el",
      cze: "cs",
      ces: "cs",
    };
    return map[primary] ?? null;
  }
  return null;
}

/**
 * Test whether a result's language list matches the viewer's locale language.
 * Both sides are normalized through {@link localeToLang} so OL's three-letter
 * codes and GB's two-letter codes interoperate.
 */
function resultMatchesLocale(
  languages: string[] | undefined,
  viewerLang: string | null,
): boolean {
  if (!viewerLang) return false;
  if (!languages || languages.length === 0) return false;
  for (const lang of languages) {
    if (localeToLang(lang) === viewerLang) return true;
  }
  return false;
}

/**
 * Log-scaled edition-count contribution in `[0, 1]`. Returns 0 when missing
 * or non-positive so unknown values never get a boost.
 */
function editionCountContribution(editionCount: number | undefined): number {
  if (editionCount === undefined || editionCount <= 0) return 0;
  // log1p so editionCount=1 contributes ~ 0.15, editionCount=10 ~ 0.52,
  // editionCount=100 ~ 1.0 (saturation).
  const numerator = Math.log1p(editionCount);
  const denominator = Math.log1p(EDITION_COUNT_SATURATION);
  return Math.min(numerator / denominator, 1);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Per-result diagnostic breakdown — exposed primarily for tests so we can
 * pin individual signal contributions without re-deriving them from rank
 * order. Callers that just want sorted results should use
 * {@link rankSearchResults}.
 */
export interface RankSignals {
  exactTitle: boolean;
  exactAuthor: boolean;
  editionCount: number;
  localeMatch: boolean;
  /** Sum of (signal × weight). */
  score: number;
}

/** Compute the raw signal bundle for a single result against a query. */
export function scoreSearchResult(
  result: BookSearchResult,
  query: string,
  viewerLocale: string | undefined,
): RankSignals {
  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(result.title);
  const exactTitle = normalizedQuery.length > 0 && normalizedQuery === normalizedTitle;

  const tokens = tokenize(query);
  const normalizedAuthors = result.authors.map((a) => normalizeText(a));
  // Author "exact match" = any single query token (or the full query) equals
  // a full author name. Single-author searches like `"tolkien"` and combined
  // queries like `"lord of the rings tolkien"` both work this way.
  const candidates = tokens.length > 0 ? [...tokens, normalizedQuery] : [normalizedQuery];
  const exactAuthor = candidates.some(
    (cand) => cand.length > 0 && normalizedAuthors.includes(cand),
  );

  const editionCount = editionCountContribution(result.editionCount);

  const viewerLang = localeToLang(viewerLocale);
  const localeMatch = resultMatchesLocale(result.languages, viewerLang);

  const score =
    (exactTitle ? SEARCH_RANK_WEIGHTS.exactTitle : 0) +
    (exactAuthor ? SEARCH_RANK_WEIGHTS.exactAuthor : 0) +
    editionCount * SEARCH_RANK_WEIGHTS.editionCountScale +
    (localeMatch ? SEARCH_RANK_WEIGHTS.localeMatch : 0);

  return { exactTitle, exactAuthor, editionCount, localeMatch, score };
}

// ---------------------------------------------------------------------------
// Sorter
// ---------------------------------------------------------------------------

/**
 * Re-rank a list of catalog search results.
 *
 * @param results - Results in the provider's default order. Treated as
 *   read-only; a new array is returned.
 * @param query - The raw user query. Used for exact-title / exact-author
 *   matching. Empty / whitespace-only queries skip the title/author boosts
 *   (so a blank query degrades gracefully to "edition + locale + provider
 *   order").
 * @param viewerLocale - Caller-supplied locale string (BCP-47 like
 *   `"en-US"`, bare two-letter code like `"en"`, or three-letter code like
 *   `"eng"`). `undefined` / unknown locales skip the locale boost.
 *
 * The sort is stable: when two results tie on score AND tie on
 * `firstPublishedYear`, the one earlier in the input array wins. This means
 * upstream order is preserved whenever our boosts don't disagree with it.
 */
export function rankSearchResults(
  results: readonly BookSearchResult[],
  query: string,
  viewerLocale: string | undefined,
): BookSearchResult[] {
  if (results.length <= 1) return results.slice();

  // Score everything once, then sort by score (desc) with publishYear (desc)
  // tiebreak and stable provider-order fallback.
  const scored = results.map((result, providerIndex) => ({
    result,
    providerIndex,
    score: scoreSearchResult(result, query, viewerLocale).score,
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ya = a.result.firstPublishedYear ?? Number.NEGATIVE_INFINITY;
    const yb = b.result.firstPublishedYear ?? Number.NEGATIVE_INFINITY;
    if (yb !== ya) return yb - ya;
    return a.providerIndex - b.providerIndex;
  });

  return scored.map((s) => s.result);
}
