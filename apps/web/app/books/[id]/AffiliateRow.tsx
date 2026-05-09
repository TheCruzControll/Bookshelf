"use client";

import {
  buildAffiliateUrl,
  getLocaleRetailers,
  type AffiliateConfig,
  type AffiliateLocale,
  type AffiliateUrlInput,
  type AffiliateRetailer
} from "@hone/domain";

const RETAILER_LABELS: Record<AffiliateRetailer, string> = {
  bookshop: "Bookshop",
  amazon: "Amazon",
  audible: "Audible",
  apple_books: "Apple Books"
};

const AFFILIATE_TAGS: Record<AffiliateRetailer, Partial<Record<AffiliateLocale, string>>> = {
  bookshop: { US: "hone-20", UK: "hone-uk" },
  amazon: {
    US: "hone-20",
    UK: "hone-uk21",
    CA: "hone-ca20",
    AU: "hone-au20",
    DE: "hone-de21",
    FR: "hone-fr21"
  },
  audible: {
    US: "hone-20",
    UK: "hone-uk21",
    CA: "hone-ca20",
    AU: "hone-au20",
    DE: "hone-de21",
    FR: "hone-fr21"
  },
  apple_books: {
    US: "1001l4wZ",
    UK: "1001l4wZ",
    CA: "1001l4wZ",
    AU: "1001l4wZ",
    DE: "1001l4wZ",
    FR: "1001l4wZ"
  }
};

export interface AffiliateRowProps {
  book: AffiliateUrlInput;
  locale: AffiliateLocale;
  onBuyClick?: (retailer: AffiliateRetailer, url: string) => void;
}

export function AffiliateRow({ book, locale, onBuyClick }: AffiliateRowProps) {
  const retailers = getLocaleRetailers(locale);

  const configs: AffiliateConfig[] = retailers.flatMap((retailer) => {
    const tag = AFFILIATE_TAGS[retailer][locale];
    if (!tag) return [];
    return [{ retailer, locale, affiliateTag: tag }];
  });

  if (configs.length === 0) return null;

  return (
    <div className="affiliateRow" role="list" aria-label="Buy this book">
      {configs.map((config) => {
        const url = buildAffiliateUrl(config, book);
        const label = RETAILER_LABELS[config.retailer];
        return (
          <a
            key={config.retailer}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            role="listitem"
            className="affiliateButton"
            aria-label={`Buy on ${label}`}
            onClick={() => onBuyClick?.(config.retailer, url)}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}
