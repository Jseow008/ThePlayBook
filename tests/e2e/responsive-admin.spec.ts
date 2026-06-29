import { expect, test } from '@playwright/test';
import {
    expectFocusedElementVisible,
    expectNoDocumentHorizontalScroll,
    getResponsiveAuthConfig,
    installResponsiveErrorGuard,
    loginThroughAdminForm,
} from './helpers/responsive';

const authConfig = getResponsiveAuthConfig();

const adminResponsiveRoutes = [
    '/admin',
    '/admin/content',
] as const;

test.describe('responsive admin routes', () => {
    test('unauthenticated admin route redirects without horizontal overflow', async ({ page }) => {
        const guard = installResponsiveErrorGuard(page);

        await page.goto('/admin');
        await expect(page).toHaveURL(/\/admin-login|\/login/);
        await expectNoDocumentHorizontalScroll(page);
        await expectFocusedElementVisible(page);

        guard.assertNoCriticalErrors();
    });

    test.describe('authenticated admin routes', () => {
        test.skip(Boolean(authConfig.skipReason), authConfig.skipReason ?? undefined);

        for (const route of adminResponsiveRoutes) {
            test(`${route} has no unintended document overflow`, async ({ page }) => {
                const guard = installResponsiveErrorGuard(page);

                const response = await loginThroughAdminForm(page, authConfig.email!, authConfig.password!, route);
                if (response) {
                    expect(response.ok() || response.status() === 304).toBe(true);
                }

                await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });
                await expectNoDocumentHorizontalScroll(page);
                await expectFocusedElementVisible(page);

                guard.assertNoCriticalErrors();
            });
        }
    });
});
