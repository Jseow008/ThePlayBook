import { test, expect } from '@playwright/test';
import { completeGuestOnboarding } from './helpers/responsive';

const fixtureId = '11111111-1111-4111-8111-111111111111';
const readPath = `/read/${fixtureId}/the-netflux-ci-reading-fixture`;
const savedPassageQuery = 'highlightId=33333333-3333-4333-8333-333333333333&source=library';

for (const [view, path, query] of [
    ['Read', readPath, 'source=library'],
    ['Preview', `/preview/${fixtureId}`, 'source=library'],
    ['saved passage', readPath, savedPassageQuery],
]) {
    test(`Sign In Back restores the ${view} summary URL and anchor`, async ({ page }) => {
        test.setTimeout(60_000);
        await completeGuestOnboarding(page);
        const returnPath = `${path}?${query}#top`;
        await page.goto(returnPath);

        const signIn = query === savedPassageQuery
            ? page.getByRole('status').filter({ hasText: 'Sign in to open this saved passage.' }).getByRole('link', { name: 'Sign in', exact: true })
            : page.getByRole('link', { name: /^(Sign In|→)$/i }).first();
        await expect(signIn).toHaveAttribute('href', `/login?${new URLSearchParams({ next: returnPath })}`);
        await signIn.click();
        await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('next') === returnPath, { timeout: 15_000 });

        const back = page.getByRole('link', { name: 'Back', exact: true });
        await expect(back).toHaveAttribute('href', returnPath);
        await back.click();
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}${url.hash}` === returnPath, { timeout: 15_000 });
        await expect(page.getByRole('heading', { name: 'The Netflux CI Reading Fixture', level: 1 })).toBeVisible();
    });
}

test.describe('Authentication Flows', () => {
    test('login page renders correctly', async ({ page }) => {
        await page.goto('/login');

        // Check if the login form/buttons are present
        // The actual text might be different based on the design, so let's check for the Google button
        const googleButton = page.getByRole('button', { name: /Continue with Google/i }).or(page.locator('button:has-text("Google")'));

        await expect(googleButton).toBeVisible();
        await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute('href', '/browse');
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
