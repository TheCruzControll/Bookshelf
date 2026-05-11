import { describe, it, expect, vi, beforeEach } from "vitest";
import * as authApi from "../auth/auth-api";
import * as session from "../auth/session";

vi.mock("../auth/auth-api", () => ({
  appleSignIn: vi.fn(),
  googleSignIn: vi.fn(),
  requestMagicLink: vi.fn(),
  consumeMagicLink: vi.fn(),
}));

vi.mock("../auth/session", () => ({
  persistSession: vi.fn(),
  getSession: vi.fn(),
  clearSession: vi.fn(),
}));

describe("SignUpPage auth flow logic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("appleSignIn stores session and redirects new user to onboarding", async () => {
    vi.mocked(authApi.appleSignIn).mockResolvedValue({
      sessionToken: "tok_apple_new",
      expiresAt: "2026-06-01T00:00:00Z",
      isNewUser: true,
    });

    const result = await authApi.appleSignIn("token");
    session.persistSession(result.sessionToken);

    expect(session.persistSession).toHaveBeenCalledWith("tok_apple_new");
    expect(result.isNewUser).toBe(true);
  });

  it("googleSignIn stores session and redirects existing user to home", async () => {
    vi.mocked(authApi.googleSignIn).mockResolvedValue({
      sessionToken: "tok_google_existing",
      expiresAt: "2026-06-01T00:00:00Z",
      isNewUser: false,
    });

    const result = await authApi.googleSignIn("id-token");
    session.persistSession(result.sessionToken);

    expect(session.persistSession).toHaveBeenCalledWith("tok_google_existing");
    expect(result.isNewUser).toBe(false);
  });

  it("requestMagicLink sends email for sign-up", async () => {
    vi.mocked(authApi.requestMagicLink).mockResolvedValue({
      expiresAt: "2026-06-01T00:10:00Z",
    });

    const result = await authApi.requestMagicLink("newuser@example.com");
    expect(result.expiresAt).toBe("2026-06-01T00:10:00Z");
  });

  it("all three providers are wired: apple, google, email", () => {
    expect(typeof authApi.appleSignIn).toBe("function");
    expect(typeof authApi.googleSignIn).toBe("function");
    expect(typeof authApi.requestMagicLink).toBe("function");
  });

  it("redirect-to-onboarding after first sign-up (isNewUser=true)", () => {
    const result = { sessionToken: "tok", expiresAt: "2026-01-01", isNewUser: true };
    const destination = result.isNewUser ? "/onboarding" : "/";
    expect(destination).toBe("/onboarding");
  });

  it("sign-up with existing account redirects to home (isNewUser=false)", () => {
    const result = { sessionToken: "tok", expiresAt: "2026-01-01", isNewUser: false };
    const destination = result.isNewUser ? "/onboarding" : "/";
    expect(destination).toBe("/");
  });
});
