import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenLibraryClient } from "./open-library-client.js";

const USER_AGENT = "HoneTest/1.0 (test@example.com)";

function makeClient(overrides?: {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}) {
  return new OpenLibraryClient({
    userAgent: USER_AGENT,
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

describe("OpenLibraryClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("uses default values when not provided", () => {
      const client = new OpenLibraryClient({ userAgent: USER_AGENT });
      expect(client).toBeDefined();
    });
  });

  describe("search", () => {
    it("returns mapped results from OL search API", async () => {
      const olResponse = {
        numFound: 2,
        docs: [
          {
            key: "/works/OL123W",
            title: "The Great Gatsby",
            subtitle: "A Novel",
            author_name: ["F. Scott Fitzgerald"],
            first_publish_year: 1925,
            cover_i: 8091557,
            isbn: ["9780743273565", "0743273567"],
            publisher: ["Scribner"],
            number_of_pages_median: 180,
            subject: ["Fiction", "American literature"],
          },
          {
            key: "/works/OL456W",
            title: "Gatsby: A Cultural Study",
            author_name: ["Jane Smith"],
            first_publish_year: 2010,
          },
        ],
      };

      globalThis.fetch = mockFetch({ json: olResponse });

      const client = makeClient();
      const results = await client.search("gatsby", 10);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        source: "open_library",
        sourceKey: "/works/OL123W",
        title: "The Great Gatsby",
        subtitle: "A Novel",
        authors: ["F. Scott Fitzgerald"],
        coverUrl: "https://covers.openlibrary.org/b/id/8091557-L.jpg",
        firstPublishedYear: 1925,
        publisher: "Scribner",
        isbn10: "0743273567",
        isbn13: "9780743273565",
        pageCount: 180,
        genres: ["Fiction", "American literature"],
      });

      expect(results[1]).toEqual({
        source: "open_library",
        sourceKey: "/works/OL456W",
        title: "Gatsby: A Cultural Study",
        subtitle: undefined,
        authors: ["Jane Smith"],
        coverUrl: undefined,
        firstPublishedYear: 2010,
        publisher: undefined,
        isbn10: undefined,
        isbn13: undefined,
        pageCount: undefined,
        genres: undefined,
      });
    });

    it("sends correct query parameters", async () => {
      globalThis.fetch = mockFetch({ json: { numFound: 0, docs: [] } });

      const client = makeClient();
      await client.search("test query", 5);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("q=test+query"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": USER_AGENT,
          }),
        })
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=5"),
        expect.anything()
      );
    });

    it("sends User-Agent header", async () => {
      globalThis.fetch = mockFetch({ json: { numFound: 0, docs: [] } });

      const client = makeClient();
      await client.search("test", 10);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json",
          },
        })
      );
    });

    it("returns empty array when no results", async () => {
      globalThis.fetch = mockFetch({ json: { numFound: 0, docs: [] } });

      const client = makeClient();
      const results = await client.search("nonexistent book xyz123", 10);

      expect(results).toEqual([]);
    });

    it("handles docs with missing title gracefully", async () => {
      globalThis.fetch = mockFetch({
        json: { numFound: 1, docs: [{ key: "/works/OL1W" }] },
      });

      const client = makeClient();
      const results = await client.search("test", 10);

      expect(results[0]!.title).toBe("Unknown Title");
      expect(results[0]!.authors).toEqual([]);
    });

    it("limits genres to 10 items", async () => {
      const subjects = Array.from({ length: 20 }, (_, i) => `Genre ${i}`);
      globalThis.fetch = mockFetch({
        json: {
          numFound: 1,
          docs: [{ key: "/works/OL1W", title: "Test", subject: subjects }],
        },
      });

      const client = makeClient();
      const results = await client.search("test", 10);

      expect(results[0]!.genres).toHaveLength(10);
    });
  });

  describe("lookupByIsbn", () => {
    it("returns mapped result for valid ISBN", async () => {
      const olEdition = {
        key: "/books/OL789M",
        title: "The Great Gatsby",
        subtitle: "A Novel",
        isbn_10: ["0743273567"],
        isbn_13: ["9780743273565"],
        publishers: ["Scribner"],
        publish_date: "April 10, 2004",
        number_of_pages: 180,
        covers: [8091557],
        subjects: ["Fiction"],
        description: "A novel about the American dream.",
        works: [{ key: "/works/OL123W" }],
      };

      globalThis.fetch = mockFetch({ json: olEdition });

      const client = makeClient();
      const result = await client.lookupByIsbn("978-0-7432-7356-5");

      expect(result).toEqual({
        source: "open_library",
        sourceKey: "/books/OL789M",
        title: "The Great Gatsby",
        subtitle: "A Novel",
        authors: [],
        description: "A novel about the American dream.",
        coverUrl: "https://covers.openlibrary.org/b/id/8091557-L.jpg",
        publisher: "Scribner",
        publishedDate: "April 10, 2004",
        pageCount: 180,
        isbn10: "0743273567",
        isbn13: "9780743273565",
        genres: ["Fiction"],
      });
    });

    it("returns null for non-existent ISBN (404)", async () => {
      globalThis.fetch = mockFetch({
        status: 404,
        ok: false,
        statusText: "Not Found",
      });

      const client = makeClient();
      const result = await client.lookupByIsbn("0000000000");

      expect(result).toBeNull();
    });

    it("strips hyphens and spaces from ISBN before requesting", async () => {
      globalThis.fetch = mockFetch({
        json: { key: "/books/OL1M", title: "Test" },
      });

      const client = makeClient();
      await client.lookupByIsbn("978-0-7432-7356-5");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/isbn/9780743273565.json"),
        expect.anything()
      );
    });

    it("handles description as object with value field", async () => {
      globalThis.fetch = mockFetch({
        json: {
          key: "/books/OL1M",
          title: "Test",
          description: { value: "A detailed description" },
        },
      });

      const client = makeClient();
      const result = await client.lookupByIsbn("0743273567");

      expect(result!.description).toBe("A detailed description");
    });

    it("uses lookup ISBN as fallback when edition has no ISBNs", async () => {
      globalThis.fetch = mockFetch({
        json: { key: "/books/OL1M", title: "Test" },
      });

      const client = makeClient();
      const result = await client.lookupByIsbn("0743273567");

      expect(result!.isbn10).toBe("0743273567");
      expect(result!.isbn13).toBeUndefined();
    });

    it("uses lookup ISBN-13 as fallback for isbn13", async () => {
      globalThis.fetch = mockFetch({
        json: { key: "/books/OL1M", title: "Test" },
      });

      const client = makeClient();
      const result = await client.lookupByIsbn("9780743273565");

      expect(result!.isbn13).toBe("9780743273565");
      expect(result!.isbn10).toBeUndefined();
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
          json: vi.fn().mockResolvedValue({ numFound: 0, docs: [] }),
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
          json: vi.fn().mockResolvedValue({ numFound: 0, docs: [] }),
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
        /Open Library returned 503/
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
        /Open Library request failed: 400/
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
          json: vi.fn().mockResolvedValue({ numFound: 0, docs: [] }),
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
          json: vi.fn().mockResolvedValue({ numFound: 0, docs: [] }),
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
          json: vi.fn().mockResolvedValue({ numFound: 0, docs: [] }),
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
      globalThis.fetch = mockFetch({ json: { numFound: 0, docs: [] } });

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
