import type { AffiliateRetailer } from "@hone/domain";

export interface BuyClickEvent {
  retailer: AffiliateRetailer;
  url: string;
  bookId: string;
  locale: string;
  timestamp: number;
}

export function trackBuyClick(event: BuyClickEvent): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    window.gtag("event", "affiliate_buy_click", {
      retailer: event.retailer,
      book_id: event.bookId,
      locale: event.locale,
      affiliate_url: event.url
    });
  }
  if (typeof window._hone !== "undefined") {
    window._hone.track("affiliate_buy_click", {
      retailer: event.retailer,
      book_id: event.bookId,
      locale: event.locale
    });
  }
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    _hone?: { track: (event: string, props: Record<string, string>) => void };
  }
}
