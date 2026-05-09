import { describe, it, expect } from "vitest";
import { createApi } from "../app";

describe("tRPC mount", () => {
  it("mounts at /trpc/* and responds to unknown procedure with not-found", async () => {
    const app = createApi();
    const res = await app.request("/trpc/nonexistent", {
      method: "GET"
    });
    expect(res.status).toBe(404);
  });

  it("/health is still reachable after tRPC mount", async () => {
    const app = createApi();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, service: "hone-api" });
  });
});
