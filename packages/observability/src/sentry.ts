import * as Sentry from "@sentry/node";

export interface SentryEnv {
  SENTRY_DSN: string;
  SENTRY_ENVIRONMENT: "development" | "staging" | "production";
}

export function initSentry(env: SentryEnv): void {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: env.SENTRY_ENVIRONMENT === "production" ? 0.2 : 1.0,
  });
}
