import { describe, it, expect, vi } from "vitest";
import { createApi } from "../app";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

describe("tRPC health procedure — integration", () => {
  it("GET /trpc/health returns 200 with ok shape", async () => {
    const app = createApi();
    const res = await app.request("/trpc/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      result: {
        data: { ok: true, service: "hone-api" },
      },
    });
  });

  it("GET /trpc/health returns JSON content-type", async () => {
    const app = createApi();
    const res = await app.request("/trpc/health");
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("GET /trpc/health works with mocked context dependencies", async () => {
    const auth = { getCurrentIdentity: vi.fn().mockResolvedValue(null) };
    const app = createApi({ auth });
    const res = await app.request("/trpc/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.ok).toBe(true);
    expect(body.result.data.service).toBe("hone-api");
  });
});
