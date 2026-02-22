import { test, expect } from '@playwright/test';

test('homepage loads and renders correctly', async ({ page }) => {
    await page.goto('/');

    // Verify the main heading exists
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // Verify the navigation bar exists
    const nav = page.locator('nav').first();
    await expect(nav).toBeVisible();

    // Verify there is a Netflux logo/text
    await expect(page.getByText('NETFLUX', { exact: false }).first()).toBeVisible();
});
