/**
 * Client-side helpers to call the tRPC auth procedures via fetch.
 *
 * We intentionally avoid importing the full tRPC client here; the auth
 * pages are lightweight and only need three mutations.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export interface AuthResult {
  sessionToken: string;
  expiresAt: string;
  isNewUser: boolean;
}

async function trpcMutate<T>(
  procedure: string,
  input: unknown
): Promise<T> {
  const res = await fetch(`${API_URL}/trpc/${procedure}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { error?: { message?: string } }).error?.message ??
      `Auth request failed (${res.status})`;
    throw new Error(message);
  }

  const json = (await res.json()) as { result?: { data?: T } };
  if (!json.result?.data) {
    throw new Error("Unexpected response shape");
  }
  return json.result.data;
}

export function appleSignIn(
  identityToken: string,
  nonce?: string
): Promise<AuthResult> {
  return trpcMutate<AuthResult>("auth.appleSignIn", { identityToken, nonce });
}

export function googleSignIn(idToken: string): Promise<AuthResult> {
  return trpcMutate<AuthResult>("auth.googleSignIn", { idToken });
}

export function requestMagicLink(
  email: string
): Promise<{ expiresAt: string }> {
  return trpcMutate<{ expiresAt: string }>("auth.requestMagicLink", { email });
}

export function consumeMagicLink(
  token: string
): Promise<AuthResult> {
  return trpcMutate<AuthResult>("auth.consumeMagicLink", { token });
}
