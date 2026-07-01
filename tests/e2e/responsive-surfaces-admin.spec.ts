import { expect, test } from '@playwright/test';
import {
    expectContainerOwnsHorizontalOverflow,
    expectElementContainedInViewport,
    expectFocusedInputVisibleAfterKeyboard,
    expectLocatorCenterNotCovered,
    expectNoDocumentHorizontalScroll,
    getResponsiveAuthConfig,
    installResponsiveErrorGuard,
    loginThroughAdminForm,
} from './helpers/responsive';

const authConfig = getResponsiveAuthConfig();

test.describe('responsive admin high-risk surfaces', () => {
    test.skip(Boolean(authConfig.skipReason), authConfig.skipReason ?? undefined);

    test('/admin/content keeps filters and workbench controls contained', async ({ page }) => {
        const guard = installResponsiveErrorGuard(page);

        const response = await loginThroughAdminForm(page, authConfig.email!, authConfig.password!, '/admin/content');
        expect(response?.ok() || response?.status() === 304).toBe(true);
        await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });

        const searchInput = page.getByPlaceholder('Search content...');
        await expectFocusedInputVisibleAfterKeyboard(page, searchInput);
        await expectElementContainedInViewport(page.getByLabel('Filter content by type'), { tolerance: 2 });
        await expectElementContainedInViewport(page.getByLabel('Sort content'), { tolerance: 2 });
        await expectLocatorCenterNotCovered(page.getByRole('link', { name: /new content/i }));
        await expectNoDocumentHorizontalScroll(page);

        const viewport = page.viewportSize();
        if (viewport && viewport.width >= 1280) {
            const tableScroller = page.getByTestId('admin-content-table-scroll');
            if (await tableScroller.count() > 0 && await tableScroller.isVisible()) {
                const overflows = await tableScroller.evaluate((element) => (
                    element.scrollWidth > element.clientWidth + 1
                ));

                if (overflows) {
                    await expectContainerOwnsHorizontalOverflow(page, tableScroller);
                } else {
                    await expectElementContainedInViewport(tableScroller, { tolerance: 2 });
                    await expectNoDocumentHorizontalScroll(page);
                }
            }
        } else {
            const mobileSelectAll = page.getByLabel('Select all visible content').first();
            if (await mobileSelectAll.count() > 0) {
                await expectElementContainedInViewport(mobileSelectAll, { tolerance: 2 });
                await expectLocatorCenterNotCovered(mobileSelectAll);
            }
        }

        guard.assertNoCriticalErrors();
    });
});
