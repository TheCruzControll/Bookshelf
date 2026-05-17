/**
 * Smoke tests for the Goodreads fixture loader (K-08).
 *
 * The fixtures themselves are exercised in `@hone/domain`'s
 * `imports-fixtures.test.ts` (bucket-assertion suite); these tests just
 * confirm each named fixture is present on disk, loads without error, and
 * yields the expected canonical Goodreads CSV header so consumers can rely
 * on the column layout.
 */
import { describe, it, expect } from "vitest";
import {
  loadGoodreadsFixture,
  type GoodreadsFixtureName,
} from "./goodreads-fixtures.js";

const FIXTURES: readonly GoodreadsFixtureName[] = [
  "matched.csv",
  "needs-review.csv",
  "unmatched.csv",
  "re-upload.csv",
  "conflict.csv",
];

const EXPECTED_HEADER_PREFIX = "Book Id,Title,Author";

describe("loadGoodreadsFixture", () => {
  it.each(FIXTURES)("loads %s as a non-empty string", (name) => {
    const csv = loadGoodreadsFixture(name);
    expect(typeof csv).toBe("string");
    expect(csv.length).toBeGreaterThan(0);
  });

  it.each(FIXTURES)("%s starts with the canonical Goodreads CSV header", (name) => {
    const csv = loadGoodreadsFixture(name);
    expect(csv.startsWith(EXPECTED_HEADER_PREFIX)).toBe(true);
  });

  it("returns identical content on repeated reads of the same fixture", () => {
    const a = loadGoodreadsFixture("matched.csv");
    const b = loadGoodreadsFixture("matched.csv");
    expect(a).toBe(b);
  });
});
