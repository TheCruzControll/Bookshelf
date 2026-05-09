export type AffiliateRetailer =
  | "bookshop"
  | "amazon"
  | "audible"
  | "apple_books";

export type AffiliateLocale = "US" | "UK" | "CA" | "AU" | "DE" | "FR";

export interface AffiliateConfig {
  retailer: AffiliateRetailer;
  locale: AffiliateLocale;
  affiliateTag: string;
}

export interface AffiliateUrlInput {
  isbn13?: string | undefined;
  asin?: string | undefined;
  title?: string | undefined;
  author?: string | undefined;
}

type BuildUrl = (input: AffiliateUrlInput, tag: string) => string;

interface RetailerLocaleTemplate {
  baseUrl: string;
  buildUrl: BuildUrl;
}

function searchQuery(input: AffiliateUrlInput): string {
  return encodeURIComponent(
    [input.title, input.author].filter(Boolean).join(" ")
  );
}

function makeBookshopTemplate(domain: string): RetailerLocaleTemplate {
  return {
    baseUrl: `https://${domain}`,
    buildUrl: (input, tag) => {
      if (input.isbn13) {
        return `https://${domain}/a/${tag}/${input.isbn13}`;
      }
      return `https://${domain}/search?keywords=${searchQuery(input)}&affiliate=${tag}`;
    }
  };
}

function makeAmazonTemplate(domain: string): RetailerLocaleTemplate {
  return {
    baseUrl: `https://${domain}`,
    buildUrl: (input, tag) => {
      const id = input.isbn13 ?? input.asin;
      if (id) {
        return `https://${domain}/dp/${id}?tag=${tag}`;
      }
      return `https://${domain}/s?k=${searchQuery(input)}&tag=${tag}`;
    }
  };
}

function makeAudibleTemplate(domain: string): RetailerLocaleTemplate {
  return {
    baseUrl: `https://${domain}`,
    buildUrl: (input, tag) => {
      if (input.asin) {
        return `https://${domain}/pd/${input.asin}?tag=${tag}`;
      }
      return `https://${domain}/search?keywords=${searchQuery(input)}&tag=${tag}`;
    }
  };
}

function makeAppleBooksTemplate(countryCode: string): RetailerLocaleTemplate {
  return {
    baseUrl: `https://books.apple.com/${countryCode}`,
    buildUrl: (input, tag) => {
      if (input.isbn13) {
        return `https://books.apple.com/${countryCode}/book/id${input.isbn13}?at=${tag}`;
      }
      return `https://books.apple.com/${countryCode}/search?term=${searchQuery(input)}&at=${tag}`;
    }
  };
}

const RETAILER_TEMPLATES: Record<
  AffiliateRetailer,
  Partial<Record<AffiliateLocale, RetailerLocaleTemplate>>
> = {
  bookshop: {
    US: makeBookshopTemplate("bookshop.org"),
    UK: makeBookshopTemplate("uk.bookshop.org")
  },
  amazon: {
    US: makeAmazonTemplate("www.amazon.com"),
    UK: makeAmazonTemplate("www.amazon.co.uk"),
    CA: makeAmazonTemplate("www.amazon.ca"),
    AU: makeAmazonTemplate("www.amazon.com.au"),
    DE: makeAmazonTemplate("www.amazon.de"),
    FR: makeAmazonTemplate("www.amazon.fr")
  },
  audible: {
    US: makeAudibleTemplate("www.audible.com"),
    UK: makeAudibleTemplate("www.audible.co.uk"),
    CA: makeAudibleTemplate("www.audible.ca"),
    AU: makeAudibleTemplate("www.audible.com.au"),
    DE: makeAudibleTemplate("www.audible.de"),
    FR: makeAudibleTemplate("www.audible.fr")
  },
  apple_books: {
    US: makeAppleBooksTemplate("us"),
    UK: makeAppleBooksTemplate("gb"),
    CA: makeAppleBooksTemplate("ca"),
    AU: makeAppleBooksTemplate("au"),
    DE: makeAppleBooksTemplate("de"),
    FR: makeAppleBooksTemplate("fr")
  }
};

export function buildAffiliateUrl(
  config: AffiliateConfig,
  input: AffiliateUrlInput
): string {
  const localeTemplates = RETAILER_TEMPLATES[config.retailer];
  const template = localeTemplates[config.locale];

  if (!template) {
    throw new Error(
      `Unsupported locale "${config.locale}" for retailer "${config.retailer}"`
    );
  }

  return template.buildUrl(input, config.affiliateTag);
}

export function getLocaleRetailers(locale: AffiliateLocale): AffiliateRetailer[] {
  const retailers: AffiliateRetailer[] = [
    "bookshop",
    "amazon",
    "audible",
    "apple_books"
  ];
  return retailers.filter((r) => {
    const localeTemplates = RETAILER_TEMPLATES[r];
    return locale in localeTemplates;
  });
}
