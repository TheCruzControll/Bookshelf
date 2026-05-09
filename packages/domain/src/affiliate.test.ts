import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  buildAffiliateUrl,
  getLocaleRetailers,
  type AffiliateLocale,
  type AffiliateRetailer
} from "./affiliate";

const LOCALES: AffiliateLocale[] = ["US", "UK", "CA", "AU", "DE", "FR"];
const RETAILERS: AffiliateRetailer[] = [
  "bookshop",
  "amazon",
  "audible",
  "apple_books"
];

describe("buildAffiliateUrl", () => {
  describe("bookshop", () => {
    it("builds US bookshop URL with ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "bookshop", locale: "US", affiliateTag: "hone-20" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe("https://bookshop.org/a/hone-20/9780306406157");
    });

    it("builds UK bookshop URL with ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "bookshop", locale: "UK", affiliateTag: "hone-uk" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe("https://uk.bookshop.org/a/hone-uk/9780306406157");
    });

    it("builds US bookshop search URL when no ISBN", () => {
      const url = buildAffiliateUrl(
        { retailer: "bookshop", locale: "US", affiliateTag: "hone-20" },
        { title: "The Hobbit", author: "Tolkien" }
      );
      expect(url).toContain("bookshop.org/search");
      expect(url).toContain("affiliate=hone-20");
      expect(url).toContain("The%20Hobbit");
    });

    it("builds UK bookshop search URL when no ISBN", () => {
      const url = buildAffiliateUrl(
        { retailer: "bookshop", locale: "UK", affiliateTag: "hone-uk" },
        { title: "The Hobbit" }
      );
      expect(url).toContain("uk.bookshop.org/search");
      expect(url).toContain("affiliate=hone-uk");
    });

    it("throws for unsupported locale", () => {
      expect(() =>
        buildAffiliateUrl(
          { retailer: "bookshop", locale: "CA", affiliateTag: "tag" },
          { isbn13: "9780306406157" }
        )
      ).toThrow('Unsupported locale "CA" for retailer "bookshop"');
    });
  });

  describe("amazon", () => {
    it("builds US amazon URL with ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "amazon", locale: "US", affiliateTag: "hone-20" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe("https://www.amazon.com/dp/9780306406157?tag=hone-20");
    });

    it("builds UK amazon URL with ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "amazon", locale: "UK", affiliateTag: "hone-uk21" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe(
        "https://www.amazon.co.uk/dp/9780306406157?tag=hone-uk21"
      );
    });

    it("builds CA amazon URL", () => {
      const url = buildAffiliateUrl(
        { retailer: "amazon", locale: "CA", affiliateTag: "hone-ca" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe("https://www.amazon.ca/dp/9780306406157?tag=hone-ca");
    });

    it("builds AU amazon URL", () => {
      const url = buildAffiliateUrl(
        { retailer: "amazon", locale: "AU", affiliateTag: "hone-au" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe(
        "https://www.amazon.com.au/dp/9780306406157?tag=hone-au"
      );
    });

    it("builds DE amazon URL", () => {
      const url = buildAffiliateUrl(
        { retailer: "amazon", locale: "DE", affiliateTag: "hone-de" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe("https://www.amazon.de/dp/9780306406157?tag=hone-de");
    });

    it("builds FR amazon URL", () => {
      const url = buildAffiliateUrl(
        { retailer: "amazon", locale: "FR", affiliateTag: "hone-fr" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe("https://www.amazon.fr/dp/9780306406157?tag=hone-fr");
    });

    it("prefers ISBN-13 over ASIN when both provided", () => {
      const url = buildAffiliateUrl(
        { retailer: "amazon", locale: "US", affiliateTag: "hone-20" },
        { isbn13: "9780306406157", asin: "B00XYZ" }
      );
      expect(url).toContain("/dp/9780306406157");
    });

    it("falls back to ASIN when no ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "amazon", locale: "US", affiliateTag: "hone-20" },
        { asin: "B00XYZABC" }
      );
      expect(url).toBe("https://www.amazon.com/dp/B00XYZABC?tag=hone-20");
    });

    it("builds search URL when no ISBN or ASIN", () => {
      const url = buildAffiliateUrl(
        { retailer: "amazon", locale: "US", affiliateTag: "hone-20" },
        { title: "Dune", author: "Herbert" }
      );
      expect(url).toContain("amazon.com/s?k=");
      expect(url).toContain("tag=hone-20");
    });

    it("builds CA search URL when no ISBN", () => {
      const url = buildAffiliateUrl(
        { retailer: "amazon", locale: "CA", affiliateTag: "hone-ca" },
        { title: "Dune" }
      );
      expect(url).toContain("amazon.ca/s?k=");
      expect(url).toContain("tag=hone-ca");
    });
  });

  describe("audible", () => {
    it("builds US audible URL with ASIN", () => {
      const url = buildAffiliateUrl(
        { retailer: "audible", locale: "US", affiliateTag: "hone-20" },
        { asin: "B00AUDIBLE" }
      );
      expect(url).toBe("https://www.audible.com/pd/B00AUDIBLE?tag=hone-20");
    });

    it("builds UK audible URL with ASIN", () => {
      const url = buildAffiliateUrl(
        { retailer: "audible", locale: "UK", affiliateTag: "hone-uk" },
        { asin: "B00AUDIBLE" }
      );
      expect(url).toBe("https://www.audible.co.uk/pd/B00AUDIBLE?tag=hone-uk");
    });

    it("builds CA audible URL with ASIN", () => {
      const url = buildAffiliateUrl(
        { retailer: "audible", locale: "CA", affiliateTag: "hone-ca" },
        { asin: "B00AUDIBLE" }
      );
      expect(url).toBe("https://www.audible.ca/pd/B00AUDIBLE?tag=hone-ca");
    });

    it("builds AU audible URL with ASIN", () => {
      const url = buildAffiliateUrl(
        { retailer: "audible", locale: "AU", affiliateTag: "hone-au" },
        { asin: "B00AUDIBLE" }
      );
      expect(url).toBe(
        "https://www.audible.com.au/pd/B00AUDIBLE?tag=hone-au"
      );
    });

    it("builds DE audible URL with ASIN", () => {
      const url = buildAffiliateUrl(
        { retailer: "audible", locale: "DE", affiliateTag: "hone-de" },
        { asin: "B00AUDIBLE" }
      );
      expect(url).toBe("https://www.audible.de/pd/B00AUDIBLE?tag=hone-de");
    });

    it("builds FR audible URL with ASIN", () => {
      const url = buildAffiliateUrl(
        { retailer: "audible", locale: "FR", affiliateTag: "hone-fr" },
        { asin: "B00AUDIBLE" }
      );
      expect(url).toBe("https://www.audible.fr/pd/B00AUDIBLE?tag=hone-fr");
    });

    it("builds US audible search URL when no ASIN", () => {
      const url = buildAffiliateUrl(
        { retailer: "audible", locale: "US", affiliateTag: "hone-20" },
        { title: "Project Hail Mary", author: "Weir" }
      );
      expect(url).toContain("audible.com/search");
      expect(url).toContain("tag=hone-20");
    });

    it("builds UK audible search URL when no ASIN", () => {
      const url = buildAffiliateUrl(
        { retailer: "audible", locale: "UK", affiliateTag: "hone-uk" },
        { title: "Project Hail Mary" }
      );
      expect(url).toContain("audible.co.uk/search");
    });
  });

  describe("apple_books", () => {
    it("builds US Apple Books URL with ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "apple_books", locale: "US", affiliateTag: "1234" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe(
        "https://books.apple.com/us/book/id9780306406157?at=1234"
      );
    });

    it("builds UK Apple Books URL with ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "apple_books", locale: "UK", affiliateTag: "1234" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe(
        "https://books.apple.com/gb/book/id9780306406157?at=1234"
      );
    });

    it("builds CA Apple Books URL with ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "apple_books", locale: "CA", affiliateTag: "1234" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe(
        "https://books.apple.com/ca/book/id9780306406157?at=1234"
      );
    });

    it("builds AU Apple Books URL with ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "apple_books", locale: "AU", affiliateTag: "1234" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe(
        "https://books.apple.com/au/book/id9780306406157?at=1234"
      );
    });

    it("builds DE Apple Books URL with ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "apple_books", locale: "DE", affiliateTag: "1234" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe(
        "https://books.apple.com/de/book/id9780306406157?at=1234"
      );
    });

    it("builds FR Apple Books URL with ISBN-13", () => {
      const url = buildAffiliateUrl(
        { retailer: "apple_books", locale: "FR", affiliateTag: "1234" },
        { isbn13: "9780306406157" }
      );
      expect(url).toBe(
        "https://books.apple.com/fr/book/id9780306406157?at=1234"
      );
    });

    it("builds US Apple Books search URL when no ISBN", () => {
      const url = buildAffiliateUrl(
        { retailer: "apple_books", locale: "US", affiliateTag: "1234" },
        { title: "Sapiens" }
      );
      expect(url).toContain("books.apple.com/us/search");
      expect(url).toContain("at=1234");
    });

    it("builds UK Apple Books search URL when no ISBN", () => {
      const url = buildAffiliateUrl(
        { retailer: "apple_books", locale: "UK", affiliateTag: "1234" },
        { title: "Sapiens" }
      );
      expect(url).toContain("books.apple.com/gb/search");
    });
  });
});

describe("getLocaleRetailers", () => {
  it("returns all four retailers for US", () => {
    const retailers = getLocaleRetailers("US");
    expect(retailers).toContain("bookshop");
    expect(retailers).toContain("amazon");
    expect(retailers).toContain("audible");
    expect(retailers).toContain("apple_books");
    expect(retailers).toHaveLength(4);
  });

  it("returns all four retailers for UK", () => {
    const retailers = getLocaleRetailers("UK");
    expect(retailers).toHaveLength(4);
  });

  it("returns amazon, audible, apple_books for CA (no bookshop CA)", () => {
    const retailers = getLocaleRetailers("CA");
    expect(retailers).not.toContain("bookshop");
    expect(retailers).toContain("amazon");
    expect(retailers).toContain("audible");
    expect(retailers).toContain("apple_books");
  });

  it.each(LOCALES)("returns at least one retailer for locale %s", (locale) => {
    expect(getLocaleRetailers(locale).length).toBeGreaterThan(0);
  });
});

describe("buildAffiliateUrl property tests", () => {
  const tagArb = fc.string({ minLength: 1, maxLength: 20 }).filter(
    (s) => /^[\w-]+$/.test(s)
  );
  const isbn13Arb = fc.stringMatching(/^\d{13}$/);

  it("URL always starts with https://", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<AffiliateRetailer>(...RETAILERS),
        tagArb,
        isbn13Arb,
        (retailer, tag, isbn13) => {
          const availableLocales = getLocaleRetailers(
            "US" as AffiliateLocale
          );
          if (!availableLocales.includes(retailer)) return true;
          const url = buildAffiliateUrl(
            { retailer, locale: "US", affiliateTag: tag },
            { isbn13 }
          );
          return url.startsWith("https://");
        }
      )
    );
  });

  it("locale routing: US user gets US domain, UK user gets UK domain", () => {
    fc.assert(
      fc.property(tagArb, isbn13Arb, (tag, isbn13) => {
        const usUrl = buildAffiliateUrl(
          { retailer: "bookshop", locale: "US", affiliateTag: tag },
          { isbn13 }
        );
        const ukUrl = buildAffiliateUrl(
          { retailer: "bookshop", locale: "UK", affiliateTag: tag },
          { isbn13 }
        );
        return (
          usUrl.includes("bookshop.org") &&
          !usUrl.includes("uk.bookshop.org") &&
          ukUrl.includes("uk.bookshop.org")
        );
      })
    );
  });

  it("affiliate tag always appears in the URL", () => {
    fc.assert(
      fc.property(tagArb, isbn13Arb, (tag, isbn13) => {
        const url = buildAffiliateUrl(
          { retailer: "amazon", locale: "US", affiliateTag: tag },
          { isbn13 }
        );
        return url.includes(tag);
      })
    );
  });

  it("ISBN-13 always appears in URL when provided for bookshop", () => {
    fc.assert(
      fc.property(tagArb, isbn13Arb, (tag, isbn13) => {
        const url = buildAffiliateUrl(
          { retailer: "bookshop", locale: "US", affiliateTag: tag },
          { isbn13 }
        );
        return url.includes(isbn13);
      })
    );
  });

  it("all supported locale+retailer combos return a valid HTTPS URL", () => {
    for (const retailer of RETAILERS) {
      for (const locale of LOCALES) {
        const retailers = getLocaleRetailers(locale);
        if (!retailers.includes(retailer)) continue;
        const url = buildAffiliateUrl(
          { retailer, locale, affiliateTag: "test-tag" },
          { isbn13: "9780306406157" }
        );
        expect(url).toMatch(/^https:\/\//);
        expect(url).toContain("test-tag");
      }
    }
  });
});
