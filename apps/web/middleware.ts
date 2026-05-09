import { NextRequest, NextResponse } from "next/server";

const HANDLE_PATTERN = /^\/u\/([^/]+)(\/.*)?$/;

export async function middleware(request: NextRequest) {
  const match = HANDLE_PATTERN.exec(request.nextUrl.pathname);
  if (!match) {
    return NextResponse.next();
  }

  const handle = match[1];
  const rest = match[2] ?? "";

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

  let currentHandle: string | null = null;
  try {
    const url = `${apiUrl}/trpc/profile.resolveOldHandle?input=${encodeURIComponent(JSON.stringify({ oldHandle: handle }))}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (res.ok) {
      const json = (await res.json()) as { result?: { data?: { currentHandle?: string | null } } };
      currentHandle = json?.result?.data?.currentHandle ?? null;
    }
  } catch {
    return NextResponse.next();
  }

  if (!currentHandle || currentHandle === handle) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = `/u/${currentHandle}${rest}`;
  return NextResponse.redirect(redirectUrl, { status: 301 });
}

export const config = {
  matcher: ["/u/:handle*"],
};
