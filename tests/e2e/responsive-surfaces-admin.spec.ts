import { expect, test, type Page } from '@playwright/test';
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

async function expectAdminPrimaryNavWrapsWithinTwoLines(page: Page) {
    const nav = page.locator('header nav').first();
    await expect(nav).toBeVisible();

    const lineCount = await nav.locator('a').evaluateAll((links) => {
        const rows = new Set<number>();

        links.forEach((link) => {
            const rect = link.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                rows.add(Math.round(rect.top));
            }
        });

        return rows.size;
    });

    expect(lineCount, `Admin primary nav wrapped into ${lineCount} visual lines`).toBeLessThanOrEqual(2);
}

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

    test('/admin/content supports tablet filters and new-content editor navigation', async ({ page }) => {
        test.skip(test.info().project.name !== 'tablet-portrait', 'Tablet admin editor coverage runs in the tablet-portrait project.');

        const guard = installResponsiveErrorGuard(page);

        const response = await loginThroughAdminForm(page, authConfig.email!, authConfig.password!, '/admin/content');
        expect(response?.ok() || response?.status() === 304).toBe(true);
        await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });

        await expectAdminPrimaryNavWrapsWithinTwoLines(page);
        await expectFocusedInputVisibleAfterKeyboard(page, page.getByPlaceholder('Search content...'));
        await expectElementContainedInViewport(page.getByLabel('Filter content by type'), { tolerance: 2 });
        await expectElementContainedInViewport(page.getByLabel('Sort content'), { tolerance: 2 });

        const newContentLink = page.getByRole('link', { name: /new content/i });
        await expectElementContainedInViewport(newContentLink, { tolerance: 2 });
        await expectLocatorCenterNotCovered(newContentLink);
        await newContentLink.click();

        await expect(page).toHaveURL(/\/admin\/content\/new(?:\?.*)?$/);
        await expect(page.getByRole('heading', { name: 'New Content' })).toBeVisible();

        const titleInput = page.locator('#content-title');
        await expectElementContainedInViewport(titleInput, { tolerance: 2 });
        await expectLocatorCenterNotCovered(titleInput);

        const bookButton = page.getByRole('button', { name: /^book$/i });
        await bookButton.scrollIntoViewIfNeeded();
        await expectElementContainedInViewport(bookButton, { tolerance: 2 });
        await expectLocatorCenterNotCovered(bookButton);

        const saveDraftButton = page.getByRole('button', { name: /save as draft/i });
        await saveDraftButton.scrollIntoViewIfNeeded();
        await expectElementContainedInViewport(saveDraftButton, { tolerance: 2 });
        await expectLocatorCenterNotCovered(saveDraftButton);

        await expectNoDocumentHorizontalScroll(page);
        guard.assertNoCriticalErrors();
    });
});
