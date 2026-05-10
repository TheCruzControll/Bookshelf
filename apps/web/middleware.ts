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
