import { expect, test, type Locator, type Page } from '@playwright/test';
import {
    expectMobileChromeDoesNotCoverTarget,
    expectMobileHeaderVisibilityAtScrollPositions,
    expectResponsiveRouteHealth,
    getResponsiveAuthConfig,
    installResponsiveErrorGuard,
    loginThroughAdminForm,
} from './helpers/responsive';

const authConfig = getResponsiveAuthConfig();

interface AuthenticatedResponsiveRoute {
    chrome: 'immersive' | 'standard';
    path: string;
    target: (page: Page) => Locator;
}

const authenticatedResponsiveRoutes: AuthenticatedResponsiveRoute[] = [
    {
        path: '/notes',
        chrome: 'standard',
        target: (page) => page.locator('main').first(),
    },
    {
        path: '/ask',
        chrome: 'immersive',
        target: (page) => page.locator('main').first(),
    },
];

test.describe('responsive authenticated routes', () => {
    test.skip(Boolean(authConfig.skipReason), authConfig.skipReason ?? undefined);

    for (const route of authenticatedResponsiveRoutes) {
        test(`${route.path} has no unintended document overflow`, async ({ page }) => {
            const guard = installResponsiveErrorGuard(page);

            const response = await loginThroughAdminForm(page, authConfig.email!, authConfig.password!, route.path);
            expect(response?.ok() || response?.status() === 304).toBe(true);

            const target = route.target(page);
            await expectResponsiveRouteHealth(page, target);

            if (route.chrome === 'standard') {
                await expectMobileChromeDoesNotCoverTarget(page, target);
                await expectMobileHeaderVisibilityAtScrollPositions(page);
            }

            if (route.chrome === 'immersive') {
                await expect(page.getByTestId('mobile-header')).toHaveCount(0);
                await expect(page.getByTestId('mobile-bottom-nav')).toHaveCount(0);
                await expectMobileChromeDoesNotCoverTarget(page, target);
            }

            guard.assertNoCriticalErrors();
        });
    }

    test('/library/my-list keeps empty-state CTA reachable', async ({ page }) => {
        const guard = installResponsiveErrorGuard(page);

        const response = await loginThroughAdminForm(page, authConfig.email!, authConfig.password!, '/library/my-list');
        expect(response?.ok() || response?.status() === 304).toBe(true);

        const target = page.getByRole('link', { name: /browse library/i }).or(page.locator('main').first()).first();
        await expectResponsiveRouteHealth(page, target);
        await expectMobileChromeDoesNotCoverTarget(page, target);
        await expectMobileHeaderVisibilityAtScrollPositions(page);

        guard.assertNoCriticalErrors();
    });
});
