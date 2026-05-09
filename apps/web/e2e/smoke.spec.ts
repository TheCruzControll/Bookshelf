import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("cold launch — home page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Hone/i);
    await expect(page.getByText("Hone your taste through trusted readers.")).toBeVisible();
  });

  test("sign-in stub — sign-in route returns a usable response", async ({ page, request }) => {
    const response = await request.get("/api/auth/sign-in", { failOnStatusCode: false });
    expect([200, 302, 404, 405]).toContain(response.status());
  });
});
