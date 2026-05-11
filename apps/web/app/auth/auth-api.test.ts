import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  appleSignIn,
  googleSignIn,
  requestMagicLink,
  consumeMagicLink,
} from "./auth-api";

const API_URL = "http://localhost:8787";

describe("auth-api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  function mockFetchOk(data: unknown) {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { data } }),
    });
  }

  function mockFetchError(status: number, message: string) {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => ({ error: { message } }),
    });
  }

  describe("appleSignIn", () => {
    it("calls the correct tRPC procedure", async () => {
      const authResult = {
        sessionToken: "tok_abc",
        expiresAt: "2026-06-01T00:00:00Z",
        isNewUser: true,
      };
      mockFetchOk(authResult);

      const result = await appleSignIn("apple-id-token", "nonce123");

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/trpc/auth.appleSignIn`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identityToken: "apple-id-token", nonce: "nonce123" }),
        })
      );
      expect(result).toEqual(authResult);
    });

    it("throws on non-ok response", async () => {
      mockFetchError(401, "Token expired");
      await expect(appleSignIn("bad-token")).rejects.toThrow("Token expired");
    });
  });

  describe("googleSignIn", () => {
    it("calls the correct tRPC procedure", async () => {
      const authResult = {
        sessionToken: "tok_goog",
        expiresAt: "2026-06-01T00:00:00Z",
        isNewUser: false,
      };
      mockFetchOk(authResult);

      const result = await googleSignIn("google-id-token");

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/trpc/auth.googleSignIn`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ idToken: "google-id-token" }),
        })
      );
      expect(result).toEqual(authResult);
    });

    it("throws on non-ok response", async () => {
      mockFetchError(401, "Invalid token");
      await expect(googleSignIn("bad-token")).rejects.toThrow("Invalid token");
    });
  });

  describe("requestMagicLink", () => {
    it("calls the correct tRPC procedure", async () => {
      const magicResult = { expiresAt: "2026-06-01T00:10:00Z" };
      mockFetchOk(magicResult);

      const result = await requestMagicLink("test@example.com");

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/trpc/auth.requestMagicLink`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "test@example.com" }),
        })
      );
      expect(result).toEqual(magicResult);
    });
  });

  describe("consumeMagicLink", () => {
    it("calls the correct tRPC procedure", async () => {
      const authResult = {
        sessionToken: "tok_magic",
        expiresAt: "2026-06-01T00:00:00Z",
        isNewUser: true,
      };
      mockFetchOk(authResult);

      const result = await consumeMagicLink("magic-token-123");

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/trpc/auth.consumeMagicLink`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "magic-token-123" }),
        })
      );
      expect(result).toEqual(authResult);
    });

    it("throws on expired magic link", async () => {
      mockFetchError(401, "Magic link expired");
      await expect(consumeMagicLink("expired-token")).rejects.toThrow(
        "Magic link expired"
      );
    });
  });

  it("throws when response has unexpected shape", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: {} }),
    });
    await expect(appleSignIn("token")).rejects.toThrow(
      "Unexpected response shape"
    );
  });

  it("falls back to status code message when JSON error is missing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("parse error");
      },
    });
    await expect(appleSignIn("token")).rejects.toThrow(
      "Auth request failed (500)"
    );
  });
});
