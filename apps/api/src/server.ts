import { serve } from "@hono/node-server";
import { env } from "@hone/config-env";
import { initSentry } from "@hone/observability";
import { buildCache } from "@hone/cache";
import { createApi } from "./app";

initSentry(env);

const cache = buildCache(env);
const port = env.PORT;

serve({
  fetch: createApi({ cache }).fetch,
  port
});

console.log(`Hone API listening on http://localhost:${port}`);
