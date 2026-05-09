import { type NextRequest, NextResponse } from "next/server";

const HANDLE_PATTERN = /^\/u\/([^/]+)(\/.*)?$/;

export const config = {
  matcher: ["/u/:handle*"],
};

async function resolveHandle(
  apiUrl: string,
  handle: string
): Promise<string | null> {
  try {
    const url = new URL(
      `/trpc/profile.resolveHandle?input=${encodeURIComponent(JSON.stringify({ handle }))}`,
      apiUrl
    );
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { data?: { currentHandle?: string | null } };
    };
    return json.result?.data?.currentHandle ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const match = HANDLE_PATTERN.exec(pathname);
  if (!match) return NextResponse.next();

  const handle = match[1];
  const rest = match[2] ?? "";

  if (!handle) return NextResponse.next();

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

  const currentHandle = await resolveHandle(apiUrl, handle);
  if (!currentHandle) return NextResponse.next();

  if (currentHandle.toLowerCase() === handle.toLowerCase()) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = `/u/${currentHandle}${rest}`;
  return NextResponse.redirect(redirectUrl, { status: 301 });
}
