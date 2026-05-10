import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { middleware } from "./middleware";

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    NextResponse: {
      next: vi.fn(() => ({ type: "next" })),
      redirect: vi.fn(
        (url: URL, init?: { status?: number }) => ({
          type: "redirect",
          url: url.toString(),
          status: init?.status,
        })
      ),
    },
  };
});

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`);
}

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("passes through non /u/ paths", async () => {
    const req = makeRequest("/books/123");
    await middleware(req);
    expect(NextResponse.next).toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it("passes through when API returns no redirect", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { data: null } }),
    });
    const req = makeRequest("/u/oldhandle");
    await middleware(req);
    expect(NextResponse.next).toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it("301 redirects old handle to current handle", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { data: { currentHandle: "newhandle" } },
      }),
    });
    const req = makeRequest("/u/oldhandle");
    await middleware(req);
    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/u/newhandle",
      }),
      { status: 301 }
    );
  });

  it("301 redirects and preserves sub-path", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { data: { currentHandle: "newhandle" } },
      }),
    });
    const req = makeRequest("/u/oldhandle/shelves/reading");
    await middleware(req);
    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/u/newhandle/shelves/reading",
      }),
      { status: 301 }
    );
  });

  it("does not redirect when currentHandle equals the requested handle", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { data: { currentHandle: "oldhandle" } },
      }),
    });
    const req = makeRequest("/u/oldhandle");
    await middleware(req);
    expect(NextResponse.next).toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it("passes through when API call fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network error")
    );
    const req = makeRequest("/u/somehandle");
    await middleware(req);
    expect(NextResponse.next).toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it("passes through when API returns non-ok response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    const req = makeRequest("/u/somehandle");
    await middleware(req);
    expect(NextResponse.next).toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });
});
