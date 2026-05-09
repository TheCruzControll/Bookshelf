import { serve } from "@hono/node-server";
import { env } from "@hone/config-env";
import { initSentry } from "@hone/observability";
import { createApi } from "./app";

initSentry(env);

const port = env.PORT;

serve({
  fetch: createApi().fetch,
  port
});

console.log(`Hone API listening on http://localhost:${port}`);

