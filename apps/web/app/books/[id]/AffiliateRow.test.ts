import { describe, it, expect, vi } from "vitest";
import { buildAffiliateUrl, getLocaleRetailers } from "@hone/domain";
import type { AffiliateLocale, AffiliateRetailer } from "@hone/domain";
import { trackBuyClick } from "./analytics";

describe("AffiliateRow locale retailer resolution", () => {
  it("returns all four retailers for US locale", () => {
    const retailers = getLocaleRetailers("US");
    expect(retailers).toContain("bookshop");
    expect(retailers).toContain("amazon");
    expect(retailers).toContain("audible");
    expect(retailers).toContain("apple_books");
  });

  it("returns all four retailers for UK locale", () => {
    const retailers = getLocaleRetailers("UK");
    expect(retailers).toHaveLength(4);
  });

  it("does not include bookshop for CA locale", () => {
    const retailers = getLocaleRetailers("CA");
    expect(retailers).not.toContain("bookshop");
    expect(retailers).toContain("amazon");
  });

  const locales: AffiliateLocale[] = ["US", "UK", "CA", "AU", "DE", "FR"];
  it.each(locales)("at least one retailer is configured for locale %s", (locale) => {
    expect(getLocaleRetailers(locale).length).toBeGreaterThan(0);
  });
});

describe("AffiliateRow URL building per locale", () => {
  it("builds a US Bookshop URL with ISBN-13", () => {
    const url = buildAffiliateUrl(
      { retailer: "bookshop", locale: "US", affiliateTag: "hone-20" },
      { isbn13: "9780306406157" }
    );
    expect(url).toContain("bookshop.org");
    expect(url).toContain("9780306406157");
    expect(url).toContain("hone-20");
  });

  it("builds a UK Amazon URL with ISBN-13", () => {
    const url = buildAffiliateUrl(
      { retailer: "amazon", locale: "UK", affiliateTag: "hone-uk21" },
      { isbn13: "9780306406157" }
    );
    expect(url).toContain("amazon.co.uk");
    expect(url).toContain("hone-uk21");
  });

  it("falls back to search URL when no ISBN provided", () => {
    const url = buildAffiliateUrl(
      { retailer: "amazon", locale: "US", affiliateTag: "hone-20" },
      { title: "Dune", author: "Herbert" }
    );
    expect(url).toContain("amazon.com/s");
    expect(url).toContain("Dune");
  });

  const retailers: AffiliateRetailer[] = ["bookshop", "amazon", "audible", "apple_books"];
  it.each(retailers)(
    "affiliate URL for %s always starts with https://",
    (retailer) => {
      const localeRetailers = getLocaleRetailers("US");
      if (!localeRetailers.includes(retailer)) return;
      const url = buildAffiliateUrl(
        { retailer, locale: "US", affiliateTag: "test-tag" },
        { isbn13: "9780306406157" }
      );
      expect(url).toMatch(/^https:\/\//);
    }
  );
});

describe("trackBuyClick analytics", () => {
  it("calls window.gtag with affiliate_buy_click event when gtag is available", () => {
    const gtag = vi.fn();
    Object.defineProperty(globalThis, "window", {
      value: { gtag },
      writable: true,
      configurable: true
    });

    trackBuyClick({
      retailer: "amazon",
      url: "https://www.amazon.com/dp/9780306406157?tag=hone-20",
      bookId: "book-123",
      locale: "US",
      timestamp: 1234567890
    });

    expect(gtag).toHaveBeenCalledWith("event", "affiliate_buy_click", {
      retailer: "amazon",
      book_id: "book-123",
      locale: "US",
      affiliate_url: "https://www.amazon.com/dp/9780306406157?tag=hone-20"
    });
  });

  it("calls window._hone.track with affiliate_buy_click when _hone is available", () => {
    const track = vi.fn();
    Object.defineProperty(globalThis, "window", {
      value: { _hone: { track } },
      writable: true,
      configurable: true
    });

    trackBuyClick({
      retailer: "bookshop",
      url: "https://bookshop.org/a/hone-20/9780306406157",
      bookId: "book-456",
      locale: "US",
      timestamp: 1234567890
    });

    expect(track).toHaveBeenCalledWith("affiliate_buy_click", {
      retailer: "bookshop",
      book_id: "book-456",
      locale: "US"
    });
  });

  it("does not throw when window is undefined (SSR context)", () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      writable: true,
      configurable: true
    });

    expect(() =>
      trackBuyClick({
        retailer: "audible",
        url: "https://www.audible.com/pd/B00TEST",
        bookId: "book-789",
        locale: "US",
        timestamp: 1234567890
      })
    ).not.toThrow();

    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      writable: true,
      configurable: true
    });
  });
});
