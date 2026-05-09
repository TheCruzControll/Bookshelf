import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { normalizeIsbn } from "./isbn";

function isbn10CheckDigit(digits9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits9[i]!, 10) * (10 - i);
  }
  const rem = (11 - (sum % 11)) % 11;
  return rem === 10 ? "X" : String(rem);
}

function isbn13CheckDigit(digits12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits12[i]!, 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const rem = sum % 10;
  return String(rem === 0 ? 0 : 10 - rem);
}

const digitArb = fc.constantFrom("0","1","2","3","4","5","6","7","8","9");

function makeValidIsbn13(): fc.Arbitrary<string> {
  return fc.array(digitArb, { minLength: 12, maxLength: 12 }).map((digits) => {
    const body = digits.join("");
    return body + isbn13CheckDigit(body);
  });
}

function makeValidIsbn10(): fc.Arbitrary<string> {
  return fc.array(digitArb, { minLength: 9, maxLength: 9 }).map((digits) => {
    const body = digits.join("");
    return body + isbn10CheckDigit(body);
  });
}

describe("normalizeIsbn", () => {
  it("returns canonical ISBN-13 unchanged", () => {
    expect(normalizeIsbn("9780306406157")).toBe("9780306406157");
  });

  it("converts ISBN-10 to ISBN-13", () => {
    expect(normalizeIsbn("0306406152")).toBe("9780306406157");
  });

  it("strips spaces from ISBN-13", () => {
    expect(normalizeIsbn("978 0 306406157")).toBe("9780306406157");
  });

  it("strips dashes from ISBN-13", () => {
    expect(normalizeIsbn("978-0-306406157")).toBe("9780306406157");
  });

  it("strips spaces from ISBN-10", () => {
    expect(normalizeIsbn("0 306 40615 2")).toBe("9780306406157");
  });

  it("strips dashes from ISBN-10", () => {
    expect(normalizeIsbn("0-306-40615-2")).toBe("9780306406157");
  });

  it("accepts ISBN-10 with X check digit", () => {
    expect(normalizeIsbn("080442957X")).toBe("9780804429573");
  });

  it("throws on invalid ISBN-13 checksum", () => {
    expect(() => normalizeIsbn("9780306406158")).toThrow();
  });

  it("throws on invalid ISBN-10 checksum", () => {
    expect(() => normalizeIsbn("0306406153")).toThrow();
  });

  it("throws on invalid length", () => {
    expect(() => normalizeIsbn("12345")).toThrow();
  });

  it("throws on non-digit characters in ISBN-13", () => {
    expect(() => normalizeIsbn("97803064061AB")).toThrow();
  });

  it("ISBN-10 and ISBN-13 forms of same edition produce same result", () => {
    const isbn10 = "0306406152";
    const isbn13 = "9780306406157";
    expect(normalizeIsbn(isbn10)).toBe(normalizeIsbn(isbn13));
  });
});

describe("normalizeIsbn property tests", () => {
  it("is idempotent for valid ISBN-13: normalize(normalize(x)) === normalize(x)", () => {
    fc.assert(
      fc.property(makeValidIsbn13(), (isbn13) => {
        const once = normalizeIsbn(isbn13);
        const twice = normalizeIsbn(once);
        return once === twice;
      })
    );
  });

  it("is idempotent for valid ISBN-10: normalize(normalize(x)) === normalize(x)", () => {
    fc.assert(
      fc.property(makeValidIsbn10(), (isbn10) => {
        const once = normalizeIsbn(isbn10);
        const twice = normalizeIsbn(once);
        return once === twice;
      })
    );
  });

  it("ISBN-10 and its ISBN-13 equivalent map to the same canonical key", () => {
    fc.assert(
      fc.property(makeValidIsbn10(), (isbn10) => {
        const isbn13body = "978" + isbn10.slice(0, 9);
        let sum = 0;
        for (let i = 0; i < 12; i++) {
          const d = parseInt(isbn13body[i]!, 10);
          sum += i % 2 === 0 ? d : d * 3;
        }
        const rem = sum % 10;
        const check = rem === 0 ? 0 : 10 - rem;
        const isbn13 = isbn13body + String(check);

        return normalizeIsbn(isbn10) === normalizeIsbn(isbn13);
      })
    );
  });

  it("output is always exactly 13 digits", () => {
    fc.assert(
      fc.property(makeValidIsbn13(), (isbn13) => {
        const result = normalizeIsbn(isbn13);
        return /^\d{13}$/.test(result);
      })
    );
  });
});
