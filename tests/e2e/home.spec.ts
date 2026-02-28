import { test, expect } from '@playwright/test';

test('landing page loads and renders correctly', async ({ page }) => {
    await page.goto('/');

    // Verify the hero heading exists
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // Verify the landing page has a "Start Exploring" CTA
    await expect(page.getByText('Start Exploring', { exact: false }).first()).toBeVisible();
});

test('browse page loads and renders correctly', async ({ page }) => {
    await page.goto('/browse');

    // Verify the main content area loads
    await expect(page.locator('main, [class*="HomeFeed"], [class*="hero"]').first()).toBeVisible({ timeout: 10000 });
});

test('landing page CTA navigates to browse', async ({ page }) => {
    await page.goto('/');

    // Click "Start Exploring" with force and wait for navigation
    await page.getByText('Start Exploring').first().click({ force: true });

    // Should navigate to /browse
    await page.waitForURL(/\/browse/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/browse/);
});

test('public layout chrome is excluded on landing and present on browse', async ({ page }) => {
    await page.goto('/');

    // Landing page should not include app-shell nav links
    await expect(page.locator('a[href="/random"]')).toHaveCount(0);
    await expect(page.locator('a[href="/search"]')).toHaveCount(0);

    await page.goto('/browse');

    // Browse page should include app-shell nav links
    await expect(page.locator('a[href="/random"]').first()).toBeAttached();
    await expect(page.locator('a[href="/search"]').first()).toBeAttached();
});
