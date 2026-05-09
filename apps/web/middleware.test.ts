import { describe, it, expect, vi, beforeEach } from "vitest";
import { middleware } from "./middleware";
import type { NextRequest } from "next/server";

function makeRequest(path: string, origin = "https://honebooks.app"): NextRequest {
  const cloneableUrl = {
    pathname: path,
    get href() {
      return `${origin}${this.pathname}`;
    },
    toString() {
      return this.href;
    },
  };
  return {
    nextUrl: {
      pathname: path,
      clone() {
        return Object.create(cloneableUrl, {
          pathname: { value: path, writable: true, enumerable: true },
        });
      },
    },
    url: `${origin}${path}`,
  } as unknown as NextRequest;
}

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    NextResponse: {
      next: vi.fn().mockReturnValue({ type: "next" }),
      redirect: vi.fn().mockImplementation((url: { href?: string; toString?: () => string } | string, init?: { status?: number }) => ({
        type: "redirect",
        url: typeof url === "string" ? url : (url.href ?? url.toString?.() ?? String(url)),
        status: init?.status ?? 307,
      })),
    },
  };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResolveHandle(currentHandle: string | null) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      result: { data: { currentHandle } },
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env["NEXT_PUBLIC_API_URL"] = "http://localhost:8787";
});

describe("middleware", () => {
  it("passes through requests to non-user routes", async () => {
    const req = makeRequest("/books/some-id");
    const res = await middleware(req);
    expect(res).toEqual({ type: "next" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("passes through when handle is the current handle", async () => {
    mockResolveHandle("maya");
    const req = makeRequest("/u/maya");
    const res = await middleware(req);
    expect(res).toEqual({ type: "next" });
  });

  it("301 redirects when handle is an old handle", async () => {
    mockResolveHandle("newmaya");
    const req = makeRequest("/u/oldmaya");
    const res = await middleware(req);
    expect(res).toMatchObject({ type: "redirect", status: 301 });
  });

  it("redirect preserves sub-path after handle", async () => {
    mockResolveHandle("newmaya");
    const req = makeRequest("/u/oldmaya/shelves/reading");
    const res = await middleware(req);
    expect(res).toMatchObject({ type: "redirect", status: 301 });
    expect((res as { url: string }).url).toContain("/u/newmaya/shelves/reading");
  });

  it("passes through when handle is not found in history or profiles", async () => {
    mockResolveHandle(null);
    const req = makeRequest("/u/unknownhandle");
    const res = await middleware(req);
    expect(res).toEqual({ type: "next" });
  });

  it("passes through on API fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    const req = makeRequest("/u/somehandle");
    const res = await middleware(req);
    expect(res).toEqual({ type: "next" });
  });

  it("passes through when API returns non-ok status", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const req = makeRequest("/u/somehandle");
    const res = await middleware(req);
    expect(res).toEqual({ type: "next" });
  });

  it("calls the resolveHandle API endpoint with the handle", async () => {
    mockResolveHandle("maya");
    const req = makeRequest("/u/maya");
    await middleware(req);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("profile.resolveHandle"),
      expect.any(Object)
    );
  });
});
