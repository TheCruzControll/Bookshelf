/**
 * Minimal browser-side session management.
 *
 * Stores the session token in localStorage so subsequent API calls can
 * attach it as a Bearer token. In production this would move to an
 * httpOnly cookie set by the API; this is a thin client-side bridge for
 * the initial auth pages.
 */

const SESSION_KEY = "hone_session_token";

export function persistSession(token: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SESSION_KEY, token);
  }
}

export function getSession(): string | null {
  if (typeof window !== "undefined") {
    return window.localStorage.getItem(SESSION_KEY);
  }
  return null;
}

export function clearSession(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_KEY);
  }
}
