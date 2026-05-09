"use client";

import type { AffiliateLocale, AffiliateRetailer, AffiliateUrlInput } from "@hone/domain";
import { AffiliateRow } from "./AffiliateRow";
import { trackBuyClick } from "./analytics";

interface BookBuySectionProps {
  book: AffiliateUrlInput;
  bookId: string;
  locale: AffiliateLocale;
}

export function BookBuySection({ book, bookId, locale }: BookBuySectionProps) {
  function handleBuyClick(retailer: AffiliateRetailer, url: string) {
    trackBuyClick({ retailer, url, bookId, locale, timestamp: Date.now() });
  }

  return <AffiliateRow book={book} locale={locale} onBuyClick={handleBuyClick} />;
}
