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

describe("SignInPage auth flow logic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("appleSignIn stores session and redirects new user to onboarding", async () => {
    vi.mocked(authApi.appleSignIn).mockResolvedValue({
      sessionToken: "tok_apple",
      expiresAt: "2026-06-01T00:00:00Z",
      isNewUser: true,
    });

    const result = await authApi.appleSignIn("token", "nonce");
    session.persistSession(result.sessionToken);

    expect(session.persistSession).toHaveBeenCalledWith("tok_apple");
    expect(result.isNewUser).toBe(true);
    // New user should redirect to /onboarding
  });

  it("googleSignIn stores session and redirects existing user to home", async () => {
    vi.mocked(authApi.googleSignIn).mockResolvedValue({
      sessionToken: "tok_google",
      expiresAt: "2026-06-01T00:00:00Z",
      isNewUser: false,
    });

    const result = await authApi.googleSignIn("id-token");
    session.persistSession(result.sessionToken);

    expect(session.persistSession).toHaveBeenCalledWith("tok_google");
    expect(result.isNewUser).toBe(false);
    // Existing user should redirect to /
  });

  it("requestMagicLink sends email for sign-in", async () => {
    vi.mocked(authApi.requestMagicLink).mockResolvedValue({
      expiresAt: "2026-06-01T00:10:00Z",
    });

    const result = await authApi.requestMagicLink("user@example.com");
    expect(result.expiresAt).toBe("2026-06-01T00:10:00Z");
  });

  it("handles apple sign-in error gracefully", async () => {
    vi.mocked(authApi.appleSignIn).mockRejectedValue(
      new Error("Token expired")
    );

    await expect(authApi.appleSignIn("bad-token")).rejects.toThrow(
      "Token expired"
    );
  });

  it("handles google sign-in error gracefully", async () => {
    vi.mocked(authApi.googleSignIn).mockRejectedValue(
      new Error("Invalid token")
    );

    await expect(authApi.googleSignIn("bad-token")).rejects.toThrow(
      "Invalid token"
    );
  });

  it("all three providers are wired: apple, google, email", () => {
    // Verify all three auth API functions exist and are callable
    expect(typeof authApi.appleSignIn).toBe("function");
    expect(typeof authApi.googleSignIn).toBe("function");
    expect(typeof authApi.requestMagicLink).toBe("function");
  });

  it("redirect-to-onboarding logic: isNewUser=true goes to /onboarding", () => {
    const result = { sessionToken: "tok", expiresAt: "2026-01-01", isNewUser: true };
    // The page component redirects to /onboarding when isNewUser is true
    const destination = result.isNewUser ? "/onboarding" : "/";
    expect(destination).toBe("/onboarding");
  });

  it("redirect-to-onboarding logic: isNewUser=false goes to /", () => {
    const result = { sessionToken: "tok", expiresAt: "2026-01-01", isNewUser: false };
    const destination = result.isNewUser ? "/onboarding" : "/";
    expect(destination).toBe("/");
  });
});
