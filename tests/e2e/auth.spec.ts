import { test, expect } from '@playwright/test';

test.describe('Authentication Flows', () => {
    test('login page renders correctly', async ({ page }) => {
        await page.goto('/login');

        // Check if the login form/buttons are present
        // The actual text might be different based on the design, so let's check for the Google button
        const googleButton = page.getByRole('button', { name: /Continue with Google/i }).or(page.locator('button:has-text("Google")'));

        await expect(googleButton).toBeVisible();
    });

    test('accessing protected route without session redirects to login', async ({ page }) => {
        // /admin requires login
        await page.goto('/admin');

        // We should be redirected since there's no active session
        // Next.js might redirect to /login?next=/admin which will fail a strict regex,
        // so we check if the URL path contains /login or /admin-login
        await expect(page).toHaveURL(/.*login.*/);
    });
});
