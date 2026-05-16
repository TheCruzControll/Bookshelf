/**
 * Compute the Levenshtein edit distance between two strings.
 *
 * Uses the classic two-row dynamic-programming algorithm (O(min(m,n)) memory).
 *
 * @param a first string
 * @param b second string
 * @param max optional early-exit bound — if the distance is guaranteed to exceed
 *   `max`, the function returns `max + 1` without finishing the computation.
 *   This is purely a performance optimization for the common "bounded" match
 *   case (e.g. Goodreads import where we only care about ≤ 2).
 */
export function levenshtein(a: string, b: string, max?: number): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure b is the shorter string for memory efficiency.
  let s1 = a;
  let s2 = b;
  if (s1.length < s2.length) {
    const tmp = s1;
    s1 = s2;
    s2 = tmp;
  }

  // Length-difference is a lower bound on the edit distance; short-circuit
  // when the bound is already exceeded.
  if (max !== undefined && s1.length - s2.length > max) {
    return max + 1;
  }

  const n = s1.length;
  const m = s2.length;

  let prev: number[] = new Array(m + 1);
  let curr: number[] = new Array(m + 1);

  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;
    const c1 = s1.charCodeAt(i - 1);

    for (let j = 1; j <= m; j++) {
      const cost = c1 === s2.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j]! + 1;
      const ins = curr[j - 1]! + 1;
      const sub = prev[j - 1]! + cost;
      let v = del;
      if (ins < v) v = ins;
      if (sub < v) v = sub;
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }

    if (max !== undefined && rowMin > max) {
      return max + 1;
    }

    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[m]!;
}

/**
 * Normalize a string for fuzzy matching: lowercase, strip punctuation, collapse
 * whitespace. Intentionally Unicode-aware so accented characters survive (the
 * Levenshtein cost will absorb any remaining variants).
 */
export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Extract the surname from a person's full name. Handles two common formats:
 *   - "First Last"        → "Last"
 *   - "Last, First"       → "Last"
 *   - "First Middle Last" → "Last"
 *
 * Returns an empty string when no surname can be inferred.
 */
export function extractSurname(fullName: string): string {
  // Detect "Last, First" *before* normalization, since the punctuation strip
  // would erase the comma and turn the name into a flat token list where we
  // can no longer tell surname from given name.
  const commaIdx = fullName.indexOf(",");
  if (commaIdx >= 0) {
    return normalizeForMatch(fullName.slice(0, commaIdx));
  }

  // "First [Middle] Last" form — take the last whitespace-delimited token of
  // the normalized name.
  const normalized = normalizeForMatch(fullName);
  if (!normalized) return "";
  const tokens = normalized.split(" ").filter((t) => t.length > 0);
  if (tokens.length === 0) return "";
  return tokens[tokens.length - 1]!;
}
