import { env } from "@hone/config-env";
import { initSentry } from "@hone/observability";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    initSentry(env);
  }
}
