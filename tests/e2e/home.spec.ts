import { test, expect } from '@playwright/test';

test('landing page loads and renders correctly', async ({ page }) => {
    await page.goto('/');

    // Verify the hero heading exists
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    const heroSection = heading.locator('xpath=ancestor::section[1]');

    // Reset entrance animations to their delayed starting state. Content must
    // remain readable there, not merely become visible once the animation ends.
    const reveals = heroSection.locator('.landing-hero-reveal');
    await reveals.evaluateAll(elements => elements.forEach(element => {
        element.getAnimations().forEach(animation => {
            animation.pause();
            animation.currentTime = 0;
        });
    }));
    for (const reveal of await reveals.all()) {
        await expect(reveal).toHaveCSS('opacity', '1');
        await expect(reveal).toHaveCSS('filter', 'none');
    }

    // Discovery now starts in the library; signup remains in the final CTA.
    await expect(heroSection.getByRole('link')).toHaveCount(0);
    const library = page.getByRole('region', { name: 'Explore the library' });
    await expect(library).toBeVisible();
    await expect(library.getByRole('link', { name: 'Browse all', exact: true })).toHaveAttribute('href', '/browse');
    await expect(library.getByRole('link', { name: 'Browse all', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Build Your Library Free', exact: true })).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: 'Build Your Library Free', exact: true })).toBeVisible();
});

test('browse page loads and renders correctly', async ({ page }) => {
    await page.goto('/browse');

    // Verify the main content area loads
    await expect(page.locator('main, [class*="HomeFeed"], [class*="hero"]').first()).toBeVisible({ timeout: 10000 });
});

test('landing library Browse all navigates to browse', async ({ page }) => {
    await page.goto('/');
    const library = page.getByRole('region', { name: 'Explore the library' });

    // Exercise the library's client-side navigation, not header/footer links.
    await library.getByRole('link', { name: 'Browse all', exact: true }).click();

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
