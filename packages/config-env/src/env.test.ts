import { describe, it, expect } from "vitest";
import { z } from "zod";

const validEnv = {
  DATABASE_URL: "postgresql://hone:hone@localhost:5432/hone",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  APPLE_CLIENT_ID: "com.example.app",
  APPLE_TEAM_ID: "TEAM123",
  APPLE_KEY_ID: "KEY123",
  APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  TWILIO_ACCOUNT_SID: "ACxxxxxxxx",
  TWILIO_AUTH_TOKEN: "auth-token",
  TWILIO_VERIFY_SERVICE_SID: "VAxxxxxxxx",
  KMS_KEY_ARN: "arn:aws:kms:us-east-1:123456789012:key/abc",
  KMS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
  AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  OPEN_LIBRARY_USER_AGENT: "Hone/1.0 (dev@example.com)",
  GOOGLE_BOOKS_API_KEY: "google-books-key",
  BOOKSHOP_AFFILIATE_ID_US: "bookshop-us",
  BOOKSHOP_AFFILIATE_ID_UK: "bookshop-uk",
  SENTRY_DSN: "https://sentry.example.com/123",
  SENTRY_ENVIRONMENT: "development" as const,
  PORT: "8787",
  NEXT_PUBLIC_API_URL: "http://localhost:8787",
  EXPO_PUBLIC_API_URL: "http://localhost:8787",
};

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APPLE_CLIENT_ID: z.string().min(1),
  APPLE_TEAM_ID: z.string().min(1),
  APPLE_KEY_ID: z.string().min(1),
  APPLE_PRIVATE_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_VERIFY_SERVICE_SID: z.string().min(1),
  KMS_KEY_ARN: z.string().min(1),
  KMS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  OPEN_LIBRARY_USER_AGENT: z.string().min(1).default("Hone/1.0 (dev@example.com)"),
  GOOGLE_BOOKS_API_KEY: z.string().min(1),
  BOOKSHOP_AFFILIATE_ID_US: z.string().min(1),
  BOOKSHOP_AFFILIATE_ID_UK: z.string().min(1),
  SENTRY_DSN: z.string().min(1),
  SENTRY_ENVIRONMENT: z
    .enum(["development", "staging", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:8787"),
  EXPO_PUBLIC_API_URL: z.string().url().default("http://localhost:8787"),
});

describe("envSchema", () => {
  it("parses a fully valid env successfully", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_URL).toBe(validEnv.DATABASE_URL);
      expect(result.data.PORT).toBe(8787);
      expect(result.data.SENTRY_ENVIRONMENT).toBe("development");
    }
  });

  it("coerces PORT from string to number", () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: "3000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
    }
  });

  it("applies OPEN_LIBRARY_USER_AGENT default when absent", () => {
    const { OPEN_LIBRARY_USER_AGENT: _, ...rest } = validEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.OPEN_LIBRARY_USER_AGENT).toBe("Hone/1.0 (dev@example.com)");
    }
  });

  it("applies PORT default of 8787 when absent", () => {
    const { PORT: _, ...rest } = validEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8787);
    }
  });

  it("applies SENTRY_ENVIRONMENT default of development when absent", () => {
    const { SENTRY_ENVIRONMENT: _, ...rest } = validEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SENTRY_ENVIRONMENT).toBe("development");
    }
  });

  it("fails when DATABASE_URL is missing", () => {
    const { DATABASE_URL: _, ...rest } = validEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("fails when multiple required vars are missing", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(1);
    }
  });

  it("rejects invalid SENTRY_ENVIRONMENT values", () => {
    const result = envSchema.safeParse({ ...validEnv, SENTRY_ENVIRONMENT: "prod" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid NEXT_PUBLIC_API_URL (not a URL)", () => {
    const result = envSchema.safeParse({ ...validEnv, NEXT_PUBLIC_API_URL: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects negative PORT values", () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: "-1" });
    expect(result.success).toBe(false);
  });
});
