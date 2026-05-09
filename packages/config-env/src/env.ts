import { z } from "zod";

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

  CACHE_DRIVER: z.enum(["memory", "redis"]).default("memory"),
  REDIS_URL: z.string().url().optional(),

  PORT: z.coerce.number().int().positive().default(8787),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:8787"),
  EXPO_PUBLIC_API_URL: z.string().url().default("http://localhost:8787"),
}).superRefine((data, ctx) => {
  if (data.CACHE_DRIVER === "redis" && !data.REDIS_URL) {
    ctx.addIssue({
      code: "custom",
      path: ["REDIS_URL"],
      message: "REDIS_URL is required when CACHE_DRIVER=redis",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Missing or invalid environment variables:\n${missing}`);
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);
