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

export function setSentryUser(user: { id: string; email?: string }): void {
  const sentryUser: Parameters<typeof Sentry.setUser>[0] = { id: user.id };
  if (user.email !== undefined) {
    sentryUser.email = user.email;
  }
  Sentry.setUser(sentryUser);
}

export function clearSentryUser(): void {
  Sentry.setUser(null);
}
