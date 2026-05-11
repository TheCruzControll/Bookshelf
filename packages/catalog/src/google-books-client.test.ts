import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleBooksClient } from "./google-books-client.js";

const API_KEY = "test-api-key-123";

function makeClient(overrides?: {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}) {
  return new GoogleBooksClient({
    apiKey: API_KEY,
    timeoutMs: 1000,
    maxRetries: 1,
    retryDelayMs: 10,
    ...overrides,
  });
}

function mockFetch(response: {
  status?: number;
  json?: unknown;
  ok?: boolean;
  statusText?: string;
}) {
  const status = response.status ?? 200;
  const ok = response.ok ?? (status >= 200 && status < 300);
  return vi.fn().mockResolvedValue({
    status,
    ok,
    statusText: response.statusText ?? "OK",
    json: vi.fn().mockResolvedValue(response.json ?? {}),
  });
}

describe("GoogleBooksClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe("disabled behavior (no API key)", () => {
    it("isEnabled returns false when no API key provided", () => {
      const client = new GoogleBooksClient({});
      expect(client.isEnabled()).toBe(false);
    });

    it("isEnabled returns false when API key is empty string", () => {
      const client = new GoogleBooksClient({ apiKey: "" });
      expect(client.isEnabled()).toBe(false);
    });

    it("search returns empty array when disabled", async () => {
      const client = new GoogleBooksClient({});
      const results = await client.search("gatsby", 10);
      expect(results).toEqual([]);
    });

    it("lookupByIsbn returns null when disabled", async () => {
      const client = new GoogleBooksClient({});
      const result = await client.lookupByIsbn("9780743273565");
      expect(result).toBeNull();
    });

    it("does not make network requests when disabled", async () => {
      globalThis.fetch = vi.fn();
      const client = new GoogleBooksClient({});

      await client.search("test", 10);
      await client.lookupByIsbn("0743273567");

      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe("constructor", () => {
    it("uses default values when not provided", () => {
      const client = new GoogleBooksClient({ apiKey: API_KEY });
      expect(client).toBeDefined();
      expect(client.isEnabled()).toBe(true);
    });
  });

  describe("search", () => {
    it("returns mapped results from Google Books API", async () => {
      const gbResponse = {
        totalItems: 2,
        items: [
          {
            id: "vol_123",
            volumeInfo: {
              title: "The Great Gatsby",
              subtitle: "A Novel",
              authors: ["F. Scott Fitzgerald"],
              description: "A story of the Jazz Age.",
              publishedDate: "1925-04-10",
              publisher: "Scribner",
              pageCount: 180,
              categories: ["Fiction", "American literature"],
              imageLinks: {
                thumbnail: "http://books.google.com/books/content?id=vol_123&img=1",
              },
              industryIdentifiers: [
                { type: "ISBN_10", identifier: "0743273567" },
                { type: "ISBN_13", identifier: "9780743273565" },
              ],
            },
          },
          {
            id: "vol_456",
            volumeInfo: {
              title: "Gatsby: A Cultural Study",
              authors: ["Jane Smith"],
              publishedDate: "2010",
            },
          },
        ],
      };

      globalThis.fetch = mockFetch({ json: gbResponse });

      const client = makeClient();
      const results = await client.search("gatsby", 10);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        source: "google_books",
        sourceKey: "vol_123",
        title: "The Great Gatsby",
        subtitle: "A Novel",
        authors: ["F. Scott Fitzgerald"],
        description: "A story of the Jazz Age.",
        coverUrl: "https://books.google.com/books/content?id=vol_123&img=1",
        firstPublishedYear: 1925,
        publisher: "Scribner",
        publishedDate: "1925-04-10",
        pageCount: 180,
        isbn10: "0743273567",
        isbn13: "9780743273565",
        genres: ["Fiction", "American literature"],
      });

      expect(results[1]).toEqual({
        source: "google_books",
        sourceKey: "vol_456",
        title: "Gatsby: A Cultural Study",
        subtitle: undefined,
        authors: ["Jane Smith"],
        description: undefined,
        coverUrl: undefined,
        firstPublishedYear: 2010,
        publisher: undefined,
        publishedDate: "2010",
        pageCount: undefined,
        isbn10: undefined,
        isbn13: undefined,
        genres: undefined,
      });
    });

    it("sends correct query parameters including API key", async () => {
      globalThis.fetch = mockFetch({ json: { totalItems: 0 } });

      const client = makeClient();
      await client.search("test query", 5);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("q=test+query"),
        expect.anything()
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("maxResults=5"),
        expect.anything()
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`key=${API_KEY}`),
        expect.anything()
      );
    });

    it("caps maxResults at 40", async () => {
      globalThis.fetch = mockFetch({ json: { totalItems: 0 } });

      const client = makeClient();
      await client.search("test", 100);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("maxResults=40"),
        expect.anything()
      );
    });

    it("returns empty array when no items in response", async () => {
      globalThis.fetch = mockFetch({ json: { totalItems: 0 } });

      const client = makeClient();
      const results = await client.search("nonexistent book xyz123", 10);

      expect(results).toEqual([]);
    });

    it("returns empty array when items field is missing", async () => {
      globalThis.fetch = mockFetch({ json: { totalItems: 5 } });

      const client = makeClient();
      const results = await client.search("test", 10);

      expect(results).toEqual([]);
    });

    it("handles volumes with missing volumeInfo gracefully", async () => {
      globalThis.fetch = mockFetch({
        json: { totalItems: 1, items: [{ id: "vol_1" }] },
      });

      const client = makeClient();
      const results = await client.search("test", 10);

      expect(results[0]!.title).toBe("Unknown Title");
      expect(results[0]!.authors).toEqual([]);
      expect(results[0]!.sourceKey).toBe("vol_1");
    });

    it("limits genres to 10 items", async () => {
      const categories = Array.from({ length: 20 }, (_, i) => `Genre ${i}`);
      globalThis.fetch = mockFetch({
        json: {
          totalItems: 1,
          items: [
            {
              id: "vol_1",
              volumeInfo: { title: "Test", categories },
            },
          ],
        },
      });

      const client = makeClient();
      const results = await client.search("test", 10);

      expect(results[0]!.genres).toHaveLength(10);
    });

    it("upgrades http cover URLs to https", async () => {
      globalThis.fetch = mockFetch({
        json: {
          totalItems: 1,
          items: [
            {
              id: "vol_1",
              volumeInfo: {
                title: "Test",
                imageLinks: {
                  thumbnail: "http://books.google.com/img.jpg",
                },
              },
            },
          ],
        },
      });

      const client = makeClient();
      const results = await client.search("test", 10);

      expect(results[0]!.coverUrl).toBe("https://books.google.com/img.jpg");
    });

    it("uses smallThumbnail when thumbnail is not available", async () => {
      globalThis.fetch = mockFetch({
        json: {
          totalItems: 1,
          items: [
            {
              id: "vol_1",
              volumeInfo: {
                title: "Test",
                imageLinks: {
                  smallThumbnail: "http://books.google.com/small.jpg",
                },
              },
            },
          ],
        },
      });

      const client = makeClient();
      const results = await client.search("test", 10);

      expect(results[0]!.coverUrl).toBe("https://books.google.com/small.jpg");
    });
  });

  describe("lookupByIsbn", () => {
    it("returns mapped result for valid ISBN", async () => {
      const gbResponse = {
        totalItems: 1,
        items: [
          {
            id: "vol_789",
            volumeInfo: {
              title: "The Great Gatsby",
              subtitle: "A Novel",
              authors: ["F. Scott Fitzgerald"],
              description: "A novel about the American dream.",
              publishedDate: "2004-04-10",
              publisher: "Scribner",
              pageCount: 180,
              categories: ["Fiction"],
              imageLinks: {
                thumbnail: "https://books.google.com/img.jpg",
              },
              industryIdentifiers: [
                { type: "ISBN_10", identifier: "0743273567" },
                { type: "ISBN_13", identifier: "9780743273565" },
              ],
            },
          },
        ],
      };

      globalThis.fetch = mockFetch({ json: gbResponse });

      const client = makeClient();
      const result = await client.lookupByIsbn("978-0-7432-7356-5");

      expect(result).toEqual({
        source: "google_books",
        sourceKey: "vol_789",
        title: "The Great Gatsby",
        subtitle: "A Novel",
        authors: ["F. Scott Fitzgerald"],
        description: "A novel about the American dream.",
        coverUrl: "https://books.google.com/img.jpg",
        firstPublishedYear: 2004,
        publisher: "Scribner",
        publishedDate: "2004-04-10",
        pageCount: 180,
        isbn10: "0743273567",
        isbn13: "9780743273565",
        genres: ["Fiction"],
      });
    });

    it("returns null when no volumes match ISBN", async () => {
      globalThis.fetch = mockFetch({ json: { totalItems: 0 } });

      const client = makeClient();
      const result = await client.lookupByIsbn("0000000000");

      expect(result).toBeNull();
    });

    it("returns null when items array is empty", async () => {
      globalThis.fetch = mockFetch({ json: { totalItems: 0, items: [] } });

      const client = makeClient();
      const result = await client.lookupByIsbn("0000000000");

      expect(result).toBeNull();
    });

    it("strips hyphens and spaces from ISBN before requesting", async () => {
      globalThis.fetch = mockFetch({ json: { totalItems: 0 } });

      const client = makeClient();
      await client.lookupByIsbn("978-0-7432-7356-5");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("isbn%3A9780743273565"),
        expect.anything()
      );
    });

    it("includes API key in ISBN lookup request", async () => {
      globalThis.fetch = mockFetch({ json: { totalItems: 0 } });

      const client = makeClient();
      await client.lookupByIsbn("0743273567");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`key=${API_KEY}`),
        expect.anything()
      );
    });
  });

  describe("retry logic", () => {
    it("retries on 500 error and succeeds", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          status: 500,
          ok: false,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          statusText: "OK",
          json: vi.fn().mockResolvedValue({ totalItems: 0 }),
        });
      globalThis.fetch = fetchMock;

      const client = makeClient({ maxRetries: 1, retryDelayMs: 10 });
      const results = await client.search("test", 10);

      expect(results).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries on 429 rate limit", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          status: 429,
          ok: false,
          statusText: "Too Many Requests",
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          statusText: "OK",
          json: vi.fn().mockResolvedValue({ totalItems: 0 }),
        });
      globalThis.fetch = fetchMock;

      const client = makeClient({ maxRetries: 1, retryDelayMs: 10 });
      const results = await client.search("test", 10);

      expect(results).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting retries on server error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 503,
        ok: false,
        statusText: "Service Unavailable",
      });

      const client = makeClient({ maxRetries: 2, retryDelayMs: 10 });

      await expect(client.search("test", 10)).rejects.toThrow(
        /Google Books returned 503/
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("does not retry on 4xx client errors (except 429)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        statusText: "Bad Request",
      });

      const client = makeClient({ maxRetries: 2, retryDelayMs: 10 });

      await expect(client.search("test", 10)).rejects.toThrow(
        /Google Books request failed: 400/
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("retries on network error (TypeError)", async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          statusText: "OK",
          json: vi.fn().mockResolvedValue({ totalItems: 0 }),
        });
      globalThis.fetch = fetchMock;

      const client = makeClient({ maxRetries: 1, retryDelayMs: 10 });
      const results = await client.search("test", 10);

      expect(results).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries on timeout (AbortError)", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";

      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          statusText: "OK",
          json: vi.fn().mockResolvedValue({ totalItems: 0 }),
        });
      globalThis.fetch = fetchMock;

      const client = makeClient({ maxRetries: 1, retryDelayMs: 10 });
      const results = await client.search("test", 10);

      expect(results).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("throws timeout error after exhausting retries", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";

      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const client = makeClient({ maxRetries: 1, retryDelayMs: 10 });

      await expect(client.search("test", 10)).rejects.toThrow(
        /timed out/
      );
    });

    it("uses exponential backoff between retries", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          status: 500,
          ok: false,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          status: 500,
          ok: false,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          statusText: "OK",
          json: vi.fn().mockResolvedValue({ totalItems: 0 }),
        });
      globalThis.fetch = fetchMock;

      const client = makeClient({ maxRetries: 2, retryDelayMs: 100 });
      await client.search("test", 10);

      // First retry: 100ms, second retry: 200ms (exponential backoff)
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("timeout", () => {
    it("passes abort signal to fetch", async () => {
      globalThis.fetch = mockFetch({ json: { totalItems: 0 } });

      const client = makeClient({ timeoutMs: 3000 });
      await client.search("test", 10);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });
});
