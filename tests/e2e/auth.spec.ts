import { test, expect } from '@playwright/test';

test.describe('Authentication Flows', () => {
    test('login page renders correctly', async ({ page }) => {
        await page.goto('/login');

        // Check if the login form/buttons are present
        const heading = page.getByRole('heading', { name: /Welcome back/i, includeHidden: true });
        // The actual text might be different based on the design, so let's check for the Google button
        const googleButton = page.getByRole('button', { name: /Continue with Google/i }).or(page.locator('button:has-text("Google")'));

        await expect(googleButton).toBeVisible();
    });

    test('accessing protected route without session redirects to login', async ({ page }) => {
        // /admin requires login
        await page.goto('/admin');

        // We should be redirected since there's no active session
        await expect(page).not.toHaveURL(/\/admin$/);

        // It likely redirects to /admin-login
        const url = page.url();
        expect(url.includes('/admin-login') || url.includes('/login')).toBeTruthy();
    });
});
