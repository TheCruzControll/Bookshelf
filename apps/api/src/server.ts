import { serve } from "@hono/node-server";
import { createApi } from "./app";

const port = Number(process.env.PORT ?? 8787);

serve({
  fetch: createApi().fetch,
  port
});

console.log(`Hone API listening on http://localhost:${port}`);

