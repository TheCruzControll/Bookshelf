import type { CatalogProvider, BookSearchResult } from "@hone/domain";

/** Open Library API response shapes */
interface OLSearchDoc {
  key: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  publisher?: string[];
  number_of_pages_median?: number;
  subject?: string[];
}

interface OLSearchResponse {
  numFound: number;
  docs: OLSearchDoc[];
}

interface OLEdition {
  key: string;
  title?: string;
  subtitle?: string;
  authors?: Array<{ key: string }>;
  covers?: number[];
  isbn_10?: string[];
  isbn_13?: string[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  subjects?: string[];
  description?: string | { value: string };
}

interface OLIsbnResponse extends OLEdition {
  works?: Array<{ key: string }>;
}

export interface OpenLibraryClientOptions {
  /** User-Agent string per Open Library etiquette */
  userAgent: string;
  /** Base URL for the Open Library API (defaults to https://openlibrary.org) */
  baseUrl?: string;
  /** Request timeout in milliseconds (defaults to 5000) */
  timeoutMs?: number;
  /** Number of retries on transient failures (defaults to 2) */
  maxRetries?: number;
  /** Base delay between retries in milliseconds (defaults to 500) */
  retryDelayMs?: number;
}

function extractDescription(desc: string | { value: string } | undefined): string | undefined {
  if (!desc) return undefined;
  if (typeof desc === "string") return desc;
  return desc.value;
}

function coverUrl(coverId: number | undefined): string | undefined {
  if (!coverId) return undefined;
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

function extractFirstIsbn10(isbns: string[] | undefined): string | undefined {
  if (!isbns || isbns.length === 0) return undefined;
  return isbns.find((i) => i.length === 10) ?? isbns[0];
}

function extractFirstIsbn13(isbns: string[] | undefined): string | undefined {
  if (!isbns || isbns.length === 0) return undefined;
  return isbns.find((i) => i.length === 13) ?? isbns[0];
}

/**
 * Extract a bare OL work id (e.g. `OL45804W`) from a fully-qualified work
 * key path (e.g. `/works/OL45804W`). Returns `undefined` for any value that
 * does not match the expected shape.
 */
function extractWorkId(workKey: string | undefined): string | undefined {
  if (!workKey) return undefined;
  const match = /^\/works\/(OL\d+W)$/.exec(workKey);
  return match?.[1];
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export class OpenLibraryClient implements CatalogProvider {
  private readonly userAgent: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: OpenLibraryClientOptions) {
    this.userAgent = options.userAgent;
    this.baseUrl = options.baseUrl ?? "https://openlibrary.org";
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
  }

  async search(query: string, limit: number): Promise<BookSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      fields: "key,title,subtitle,author_name,first_publish_year,cover_i,isbn,publisher,number_of_pages_median,subject",
    });

    const url = `${this.baseUrl}/search.json?${params.toString()}`;
    const response = await this.fetchWithRetry(url);
    const data = (await response.json()) as OLSearchResponse;

    return data.docs.map((doc) => this.mapSearchDoc(doc));
  }

  async lookupByIsbn(isbn: string): Promise<BookSearchResult | null> {
    const cleaned = isbn.replace(/[-\s]/g, "");
    const url = `${this.baseUrl}/isbn/${cleaned}.json`;

    const response = await this.fetchWithRetry(url, { allow404: true });
    if (response.status === 404) return null;

    const edition = (await response.json()) as OLIsbnResponse;
    return this.mapEdition(edition, cleaned);
  }

  private mapSearchDoc(doc: OLSearchDoc): BookSearchResult {
    const isbns = doc.isbn ?? [];
    const isbn10Candidates = isbns.filter((i) => i.length === 10);
    const isbn13Candidates = isbns.filter((i) => i.length === 13);

    return {
      source: "open_library",
      sourceKey: doc.key,
      title: doc.title ?? "Unknown Title",
      subtitle: doc.subtitle,
      authors: doc.author_name ?? [],
      coverUrl: coverUrl(doc.cover_i),
      firstPublishedYear: doc.first_publish_year,
      publisher: doc.publisher?.[0],
      isbn10: extractFirstIsbn10(isbn10Candidates),
      isbn13: extractFirstIsbn13(isbn13Candidates),
      pageCount: doc.number_of_pages_median,
      genres: doc.subject?.slice(0, 10),
      workId: extractWorkId(doc.key),
    };
  }

  private mapEdition(edition: OLIsbnResponse, lookupIsbn: string): BookSearchResult {
    const isbn10 = edition.isbn_10?.[0] ?? (lookupIsbn.length === 10 ? lookupIsbn : undefined);
    const isbn13 = edition.isbn_13?.[0] ?? (lookupIsbn.length === 13 ? lookupIsbn : undefined);

    return {
      source: "open_library",
      sourceKey: edition.key,
      title: edition.title ?? "Unknown Title",
      subtitle: edition.subtitle,
      authors: [],
      description: extractDescription(edition.description),
      coverUrl: coverUrl(edition.covers?.[0]),
      publisher: edition.publishers?.[0],
      publishedDate: edition.publish_date,
      pageCount: edition.number_of_pages,
      isbn10,
      isbn13,
      genres: edition.subjects?.slice(0, 10),
      workId: extractWorkId(edition.works?.[0]?.key),
    };
  }

  private async fetchWithRetry(
    url: string,
    options?: { allow404?: boolean }
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          headers: {
            "User-Agent": this.userAgent,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (options?.allow404 && response.status === 404) {
          return response;
        }

        if (isRetryable(response.status)) {
          lastError = new Error(
            `Open Library returned ${response.status} for ${url}`
          );
          continue;
        }

        if (!response.ok) {
          throw new Error(
            `Open Library request failed: ${response.status} ${response.statusText}`
          );
        }

        return response;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          lastError = new Error(`Open Library request timed out after ${this.timeoutMs}ms`);
          continue;
        }
        if (error instanceof TypeError) {
          // Network error (fetch throws TypeError for network issues)
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw lastError ?? new Error(`Open Library request failed after ${this.maxRetries + 1} attempts`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
