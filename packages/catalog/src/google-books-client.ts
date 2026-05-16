import type { CatalogProvider, BookSearchResult } from "@hone/domain";

/** Google Books API response shapes */
interface GBVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  description?: string;
  publishedDate?: string;
  publisher?: string;
  pageCount?: number;
  categories?: string[];
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
  };
  industryIdentifiers?: Array<{
    type: string;
    identifier: string;
  }>;
  /** BCP-47 language code, e.g. `"en"` or `"fr"`. Used by the search re-ranker (#73). */
  language?: string;
}

interface GBVolume {
  id: string;
  volumeInfo?: GBVolumeInfo;
}

interface GBSearchResponse {
  totalItems: number;
  items?: GBVolume[];
}

export interface GoogleBooksClientOptions {
  /** Google Books API key. If undefined, the client is disabled. */
  apiKey?: string;
  /** Base URL for the Google Books API (defaults to https://www.googleapis.com/books/v1) */
  baseUrl?: string;
  /** Request timeout in milliseconds (defaults to 5000) */
  timeoutMs?: number;
  /** Number of retries on transient failures (defaults to 2) */
  maxRetries?: number;
  /** Base delay between retries in milliseconds (defaults to 500) */
  retryDelayMs?: number;
}

function extractIsbn10(identifiers: GBVolumeInfo["industryIdentifiers"]): string | undefined {
  if (!identifiers) return undefined;
  return identifiers.find((id) => id.type === "ISBN_10")?.identifier;
}

function extractIsbn13(identifiers: GBVolumeInfo["industryIdentifiers"]): string | undefined {
  if (!identifiers) return undefined;
  return identifiers.find((id) => id.type === "ISBN_13")?.identifier;
}

function extractCoverUrl(imageLinks: GBVolumeInfo["imageLinks"]): string | undefined {
  if (!imageLinks) return undefined;
  // Prefer thumbnail over smallThumbnail, and upgrade to https
  const url = imageLinks.thumbnail ?? imageLinks.smallThumbnail;
  if (!url) return undefined;
  return url.replace(/^http:/, "https:");
}

function extractFirstPublishedYear(publishedDate: string | undefined): number | undefined {
  if (!publishedDate) return undefined;
  const year = parseInt(publishedDate.slice(0, 4), 10);
  return isNaN(year) ? undefined : year;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export class GoogleBooksClient implements CatalogProvider {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly enabled: boolean;

  constructor(options: GoogleBooksClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://www.googleapis.com/books/v1";
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.enabled = !!this.apiKey;
  }

  /** Returns true if the client has a valid API key and is operational. */
  isEnabled(): boolean {
    return this.enabled;
  }

  async search(query: string, limit: number): Promise<BookSearchResult[]> {
    if (!this.enabled) return [];

    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(limit, 40)), // Google Books API max is 40
      key: this.apiKey!,
    });

    const url = `${this.baseUrl}/volumes?${params.toString()}`;
    const response = await this.fetchWithRetry(url);
    const data = (await response.json()) as GBSearchResponse;

    if (!data.items) return [];
    return data.items.map((volume) => this.mapVolume(volume));
  }

  async lookupByIsbn(isbn: string): Promise<BookSearchResult | null> {
    if (!this.enabled) return null;

    const cleaned = isbn.replace(/[-\s]/g, "");
    const params = new URLSearchParams({
      q: `isbn:${cleaned}`,
      key: this.apiKey!,
    });

    const url = `${this.baseUrl}/volumes?${params.toString()}`;
    const response = await this.fetchWithRetry(url);
    const data = (await response.json()) as GBSearchResponse;

    if (!data.items || data.items.length === 0) return null;
    return this.mapVolume(data.items[0]!);
  }

  private mapVolume(volume: GBVolume): BookSearchResult {
    const info = volume.volumeInfo;

    return {
      source: "google_books",
      sourceKey: volume.id,
      title: info?.title ?? "Unknown Title",
      subtitle: info?.subtitle,
      authors: info?.authors ?? [],
      description: info?.description,
      coverUrl: extractCoverUrl(info?.imageLinks),
      firstPublishedYear: extractFirstPublishedYear(info?.publishedDate),
      publisher: info?.publisher,
      publishedDate: info?.publishedDate,
      pageCount: info?.pageCount,
      isbn10: extractIsbn10(info?.industryIdentifiers),
      isbn13: extractIsbn13(info?.industryIdentifiers),
      genres: info?.categories?.slice(0, 10),
      languages: info?.language ? [info.language] : undefined,
    };
  }

  private async fetchWithRetry(url: string): Promise<Response> {
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
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (isRetryable(response.status)) {
          lastError = new Error(
            `Google Books returned ${response.status} for ${url}`
          );
          continue;
        }

        if (!response.ok) {
          throw new Error(
            `Google Books request failed: ${response.status} ${response.statusText}`
          );
        }

        return response;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          lastError = new Error(`Google Books request timed out after ${this.timeoutMs}ms`);
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

    throw lastError ?? new Error(`Google Books request failed after ${this.maxRetries + 1} attempts`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
