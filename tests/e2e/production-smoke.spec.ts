import { expect, test } from "@playwright/test";

const adminEmail = process.env.SMOKE_ADMIN_EMAIL?.trim();
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD?.trim();
const healthSecret = process.env.HEALTH_CHECK_SECRET?.trim();
const readPath = process.env.SMOKE_READ_PATH?.trim();

test.describe("Production smoke checks", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page
        .getByRole("button", { name: /continue with google/i })
        .or(page.locator('button:has-text("Google")')),
    ).toBeVisible();
  });

  test("auth callback rejects missing auth code", async ({ page }) => {
    await page.goto("/auth/callback");

    await expect(page).toHaveURL(/\/login\?error=AuthCodeError/);
  });

  test("public browse page renders", async ({ page }) => {
    const response = await page.goto("/browse");

    expect(response?.ok()).toBe(true);
    await expect(
      page.getByRole("main").or(page.locator("body")).first(),
    ).toBeVisible();
  });

  test("public read page renders", async ({ page }) => {
    test.skip(
      !readPath,
      "Set SMOKE_READ_PATH to a known public read or preview path.",
    );

    const normalizedPath = readPath!.startsWith("/")
      ? readPath!
      : `/${readPath}`;
    const response = await page.goto(normalizedPath);

    expect(response?.ok()).toBe(true);
    await expect(
      page.getByRole("main").or(page.locator("body")).first(),
    ).toBeVisible();
  });

  test("admin access is denied without a session", async ({ page }) => {
    const response = await page.goto("/admin");
    const status = response?.status() ?? 0;
    const currentUrl = page.url();

    const deniedAtPlatform = [401, 403, 404].includes(status);
    const redirectedToLogin = /\/admin-login|\/login/.test(currentUrl);

    expect(deniedAtPlatform || redirectedToLogin).toBe(true);
    await expect(
      page.getByRole("heading", { name: /content dashboard/i }),
    ).toHaveCount(0);
  });

  test("admin access is allowed for an admin session", async ({ page }) => {
    test.skip(
      !adminEmail || !adminPassword,
      "Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD to verify admin access.",
    );

    await page.goto("/admin-login");
    await page.waitForLoadState("networkidle");
    await page.getByPlaceholder("Email address").fill(adminEmail!);
    await page.getByPlaceholder("Password").fill(adminPassword!);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL(/\/admin(\/)?$/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: /content dashboard|admin/i }),
    ).toBeVisible();
  });

  test("health endpoint exposes shallow and authorized detailed status", async ({
    request,
  }) => {
    test.skip(
      !healthSecret,
      "Set HEALTH_CHECK_SECRET to verify detailed health status.",
    );

    const shallow = await request.get("/api/health");
    expect(shallow.ok()).toBe(true);
    await expect(await shallow.json()).toEqual(
      expect.objectContaining({ status: "ok" }),
    );

    const detailed = await request.get("/api/health", {
      headers: {
        "x-health-check-secret": healthSecret!,
      },
    });
    expect(detailed.ok()).toBe(true);
    await expect(await detailed.json()).toEqual(
      expect.objectContaining({ status: "ok" }),
    );
  });
});
