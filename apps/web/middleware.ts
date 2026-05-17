import { NextRequest, NextResponse } from "next/server";

const HANDLE_PATTERN = /^\/u\/([^/]+)(\/.*)?$/;

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const match = HANDLE_PATTERN.exec(pathname);
  if (!match) {
    return NextResponse.next();
  }

  const handle = match[1];
  const rest = match[2] ?? "";

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

  // S-06 (#161): deletion-state probe. If the handle belongs to a
  // hard-deleted profile that is still inside the 30–90 day tombstone
  // window, the API responds `HTTP 410`. Mirror that response to the
  // browser verbatim — empty body, no rendered HTML. After the
  // tombstone expires the API answers `404` and we fall through to
  // Next's normal not-found handling for the page.
  try {
    const goneUrl = new URL(
      `/trpc/profile.byHandle?input=${encodeURIComponent(JSON.stringify({ handle }))}`,
      apiUrl
    );
    const goneRes = await fetch(goneUrl.toString(), { method: "GET" });
    if (goneRes.status === 410) {
      return new NextResponse(null, { status: 410 });
    }
  } catch {
    // Probe is best-effort: a failure should never block other routes.
  }

  try {
    const url = new URL(
      `/trpc/profile.resolveOldHandle?input=${encodeURIComponent(JSON.stringify({ handle }))}`,
      apiUrl
    );
    const res = await fetch(url.toString(), { method: "GET" });
    if (res.ok) {
      const json = (await res.json()) as {
        result?: { data?: { currentHandle?: string } | null };
      };
      const currentHandle = json?.result?.data?.currentHandle;
      if (currentHandle && currentHandle !== handle) {
        const redirectUrl = new URL(`/u/${currentHandle}${rest}`, request.url);
        return NextResponse.redirect(redirectUrl, { status: 301 });
      }
    }
  } catch {
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/u/:handle*"],
};
