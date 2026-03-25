import { test, expect } from '@playwright/test';

test('landing page loads and renders correctly', async ({ page }) => {
    await page.goto('/');

    // Verify the hero heading exists
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    const heroSection = heading.locator('xpath=ancestor::section[1]');

    // Verify the landing page exposes the current hero CTAs
    await expect(heroSection.getByRole('link', { name: 'Start Reading' })).toBeVisible();
    await expect(heroSection.getByRole('link', { name: 'Browse Library' })).toBeVisible();
});

test('browse page loads and renders correctly', async ({ page }) => {
    await page.goto('/browse');

    // Verify the main content area loads
    await expect(page.locator('main, [class*="HomeFeed"], [class*="hero"]').first()).toBeVisible({ timeout: 10000 });
});

test('landing page CTA navigates to browse', async ({ page }) => {
    await page.goto('/');
    const heroSection = page.locator('h1').locator('xpath=ancestor::section[1]');

    // Click the browse CTA and wait for navigation
    await heroSection.getByRole('link', { name: 'Browse Library' }).click();

    // Should navigate to /browse
    await page.waitForURL(/\/browse/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/browse/);
});

test('public layout chrome is excluded on landing and present on browse', async ({ page }) => {
    await page.goto('/');

    // Landing page should not include app-shell nav links
    await expect(page.locator('a[href="/focus"]')).toHaveCount(0);
    await expect(page.locator('a[href="/search"]')).toHaveCount(0);

    await page.goto('/browse');

    // Browse page should include app-shell nav links
    await expect(page.locator('a[href="/focus"]').first()).toBeAttached();
    await expect(page.locator('a[href="/search"]').first()).toBeAttached();
});
