import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { middleware } from "./middleware";

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  // Replace `next` and `redirect` with stubs while keeping the real
  // `NextResponse` class — the middleware constructs `new NextResponse(...)`
  // for the S-06 (#161) `410 Gone` path and needs the real constructor.
  const ActualNextResponse = actual.NextResponse;
  class StubNextResponse extends ActualNextResponse {}
  (StubNextResponse as unknown as { next: ReturnType<typeof vi.fn> }).next =
    vi.fn(() => new ActualNextResponse(null, { status: 200 }));
  (StubNextResponse as unknown as { redirect: ReturnType<typeof vi.fn> }).redirect =
    vi.fn((url: URL, init?: { status?: number }) =>
      ActualNextResponse.redirect(url, init?.status ?? 307)
    );
  return {
    ...actual,
    NextResponse: StubNextResponse,
  };
});

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`);
}

/**
 * The middleware fires TWO API probes per `/u/:handle` hit (S-06, #161):
 *   1. `profile.byHandle` — checks the deletion tombstone (410-or-not).
 *   2. `profile.resolveOldHandle` — handles 301 redirects for renames.
 * The byHandle probe always runs first, so every test that wants to
 * exercise the resolveOldHandle branch must stub a non-410 byHandle
 * response in front of the redirect response.
 */
function mockByHandleAlive(): void {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    status: 200,
    ok: true,
    json: async () => ({ result: { data: { profile: {} } } }),
  });
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
    mockByHandleAlive();
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
    mockByHandleAlive();
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
    mockByHandleAlive();
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
    mockByHandleAlive();
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
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("network error"));
    const req = makeRequest("/u/somehandle");
    await middleware(req);
    expect(NextResponse.next).toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it("passes through when API returns non-ok response", async () => {
    mockByHandleAlive();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    const req = makeRequest("/u/somehandle");
    await middleware(req);
    expect(NextResponse.next).toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // S-06 (#161) — 410 Gone for hard-deleted profiles in the tombstone window
  // ---------------------------------------------------------------------

  it("returns 410 with empty body when the API reports the handle is gone", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 410,
      ok: false,
      json: async () => ({}),
    });
    const req = makeRequest("/u/deleteduser");
    const res = await middleware(req);
    expect(res.status).toBe(410);
    expect(NextResponse.next).not.toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    const body = await res.text();
    expect(body).toBe("");
  });

  it("returns 410 with empty body and skips the rename redirect probe", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 410,
      ok: false,
      json: async () => ({}),
    });
    const req = makeRequest("/u/deleteduser/shelves/finished");
    const res = await middleware(req);
    expect(res.status).toBe(410);
    // Only the deletion-state probe should have fired — the rename
    // probe MUST be skipped once we know the profile is gone.
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("falls through to normal handling when the API returns 404 (expired tombstone)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ status: 404, ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { data: null } }),
      });
    const req = makeRequest("/u/longgone");
    const res = await middleware(req);
    expect(res.status).not.toBe(410);
    expect(NextResponse.next).toHaveBeenCalled();
  });
});
