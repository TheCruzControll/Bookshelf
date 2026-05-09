import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const HANDLE_ROUTE_RE = /^\/u\/([^/]+)(\/.*)?$/;

export async function middleware(request: NextRequest) {
  const match = HANDLE_ROUTE_RE.exec(request.nextUrl.pathname);
  if (!match) {
    return NextResponse.next();
  }

  const handle = match[1];
  const rest = match[2] ?? "";

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  const resolveUrl = `${apiUrl}/trpc/handleHistory.resolve?input=${encodeURIComponent(JSON.stringify({ handle }))}`;

  let currentHandle: string | null = null;
  try {
    const res = await fetch(resolveUrl, { next: { revalidate: 60 } });
    if (res.ok) {
      const body = await res.json() as { result?: { data?: { currentHandle?: string | null } } };
      currentHandle = body?.result?.data?.currentHandle ?? null;
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
