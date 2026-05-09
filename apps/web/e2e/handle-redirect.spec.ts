import { test, expect } from "@playwright/test";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:8787";

async function apiResolveHandle(handle: string): Promise<string | null> {
  try {
    const url = `${API_URL}/trpc/profile.resolveHandle?input=${encodeURIComponent(JSON.stringify({ handle }))}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { data?: { currentHandle?: string | null } };
    };
    return json.result?.data?.currentHandle ?? null;
  } catch {
    return null;
  }
}

test.describe("handle 301 redirect (spec e2e #5)", () => {
  test("logged-out visitor on old handle URL receives 301 to current handle", async ({
    request,
  }) => {
    const currentHandle = await apiResolveHandle("oldhandle");
    test.skip(
      currentHandle === null,
      "Full stack not available or handle history not seeded — requires running API + DB with seeded handle rename"
    );

    const response = await request.get("/u/oldhandle", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(301);
    const location = response.headers()["location"];
    expect(location).toBeDefined();
    expect(location).toMatch(/\/u\//);
    expect(location).toContain(`/u/${currentHandle}`);
  });

  test("visiting current handle does not redirect", async ({ request }) => {
    const currentHandle = await apiResolveHandle("oldhandle");
    test.skip(
      currentHandle === null,
      "Full stack not available or handle history not seeded"
    );

    const response = await request.get(`/u/${currentHandle}`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    expect(response.status()).not.toBe(301);
  });

  test("visiting unknown handle does not redirect", async ({ request }) => {
    const response = await request.get("/u/__nonexistent_xyz_handle__", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    expect(response.status()).not.toBe(301);
  });

  test("redirect preserves sub-path after handle", async ({ request }) => {
    const currentHandle = await apiResolveHandle("oldhandle");
    test.skip(
      currentHandle === null,
      "Full stack not available or handle history not seeded"
    );

    const response = await request.get("/u/oldhandle/shelves/reading", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(301);
    const location = response.headers()["location"];
    expect(location).toContain(`/u/${currentHandle}/shelves/reading`);
  });
});
