import { describe, it, expect } from "vitest";
import { createApi } from "./app";

describe("api smoke test", () => {
  it("createApi returns a Hono app with a /health endpoint", async () => {
    const app = createApi();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, service: "hone-api" });
  });

  it("POST /shelves/books returns 503 when dependencies are not configured", async () => {
    const app = createApi();
    const res = await app.request("/shelves/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId: "00000000-0000-0000-0000-000000000001",
        shelfId: "00000000-0000-0000-0000-000000000002",
        bookId: "00000000-0000-0000-0000-000000000003"
      })
    });
    expect(res.status).toBe(503);
  });
});
