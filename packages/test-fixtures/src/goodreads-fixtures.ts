import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "goodreads",
);

/**
 * Names of the canonical Goodreads import CSV fixtures (K-08).
 *
 * Each fixture exercises a specific bucket assignment in `matchImportRow`:
 *   - `matched.csv`      — every row has a valid ISBN that matches a Hone
 *                          catalog entry; viewer has no prior state → `matched`.
 *   - `needs-review.csv` — ISBN is missing/invalid but title+author fuzzy-match
 *                          to a Hone book → `needs_review`.
 *   - `unmatched.csv`    — no ISBN and no title/author hit → `unmatched`.
 *   - `re-upload.csv`    — identical-content re-upload semantics: the row-level
 *                          buckets stay stable across re-parse and the file
 *                          hash collides via `computeImportIdempotencyHash`.
 *   - `conflict.csv`     — ISBN matches a Hone book; mixes rows where the
 *                          viewer's status differs (`conflict`) and rows
 *                          where it matches (`duplicate`, K-06).
 */
export type GoodreadsFixtureName =
  | "matched.csv"
  | "needs-review.csv"
  | "unmatched.csv"
  | "re-upload.csv"
  | "conflict.csv";

/**
 * Read a Goodreads CSV fixture from `@hone/test-fixtures` as a UTF-8 string.
 *
 * The returned string is the raw file content — suitable both for feeding into
 * `parseGoodreadsCsv` (row parsing) and `computeImportIdempotencyHash` (file
 * hashing for re-upload detection).
 */
export function loadGoodreadsFixture(name: GoodreadsFixtureName): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf-8");
}
