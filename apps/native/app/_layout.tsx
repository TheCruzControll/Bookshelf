import { Stack } from "expo-router";
import { initSentry } from "@hone/observability";
import type { SentryEnv } from "@hone/observability";

const sentryEnv: SentryEnv = {
  SENTRY_DSN: process.env["EXPO_PUBLIC_SENTRY_DSN"] ?? "",
  SENTRY_ENVIRONMENT: (process.env["EXPO_PUBLIC_SENTRY_ENVIRONMENT"] ?? "development") as SentryEnv["SENTRY_ENVIRONMENT"],
};

if (sentryEnv.SENTRY_DSN) {
  initSentry(sentryEnv);
}

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#F7F2EA" },
        headerShadowVisible: false,
        headerTitleStyle: { color: "#181512" }
      }}
    />
  );
}

