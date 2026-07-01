import { expect, test, type Page } from '@playwright/test';
import {
    expectElementContainedInViewport,
    expectFocusedInputVisibleAfterKeyboard,
    expectLocatorCenterNotCovered,
    expectNoDocumentHorizontalScroll,
    expectOverlayCloseRestoresFocusAndScroll,
    getResponsiveAuthConfig,
    installResponsiveErrorGuard,
    loginThroughAdminForm,
} from './helpers/responsive';

const authConfig = getResponsiveAuthConfig();

function readPathFromPreviewPath(previewPath: string | null) {
    if (!previewPath) return null;

    const { pathname } = new URL(previewPath, 'http://localhost');
    const match = pathname.match(/^\/preview\/([^/]+)$/);

    return match ? `/read/${match[1]}` : null;
}

async function resolveReadPath(page: Page) {
    const configuredReadPath = process.env.RESPONSIVE_READ_PATH?.trim() || process.env.SMOKE_READ_PATH?.trim();
    if (configuredReadPath) return configuredReadPath;

    const configuredPreviewPath = process.env.RESPONSIVE_PREVIEW_PATH?.trim();
    let previewPath = configuredPreviewPath || null;

    if (!previewPath) {
        await page.goto('/browse', { waitUntil: 'domcontentloaded' });
        const previewLink = page.locator('a[href^="/preview/"]').first();
        if (await previewLink.count() === 0) return null;

        await expect(previewLink).toBeVisible({ timeout: 20_000 });
        previewPath = await previewLink.getAttribute('href');
    }

    if (!previewPath) return null;

    await page.goto(previewPath, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });

    const readLink = page.getByRole('link', { name: /read summary|^read$/i }).first();
    if (await readLink.count() > 0) {
        await expect(readLink).toBeVisible({ timeout: 5_000 });
        return readLink.getAttribute('href');
    }

    return readPathFromPreviewPath(previewPath);
}

function visibleNotesSearchInput(page: Page) {
    const viewport = page.viewportSize();
    const inputs = page.getByPlaceholder('Search notes, highlights, sources, sections');

    return viewport && viewport.width >= 1024 ? inputs.nth(1) : inputs.first();
}

test.describe('responsive authenticated high-risk surfaces', () => {
    test.skip(Boolean(authConfig.skipReason), authConfig.skipReason ?? undefined);

    test('/notes keeps sticky filters and Ask panel reachable', async ({ page }) => {
        const guard = installResponsiveErrorGuard(page);

        const response = await loginThroughAdminForm(page, authConfig.email!, authConfig.password!, '/notes');
        expect(response?.ok() || response?.status() === 304).toBe(true);
        await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });

        const searchInput = visibleNotesSearchInput(page);
        await expectFocusedInputVisibleAfterKeyboard(page, searchInput);
        await expectNoDocumentHorizontalScroll(page);

        const viewport = page.viewportSize();
        if (viewport && viewport.width >= 1024) {
            const opener = page.getByRole('button', { name: /ask these notes/i });
            const panel = page.getByTestId('notes-ask-sidebar-panel');

            await expectOverlayCloseRestoresFocusAndScroll(page, {
                opener,
                overlay: panel,
                open: async () => {
                    await opener.click();
                },
                close: async () => {
                    await page.getByLabel('Close notes AI panel').click();
                },
                assertClosed: async () => {
                    await expect(panel).toHaveCount(0);
                },
            });
        }

        guard.assertNoCriticalErrors();
    });

    test('/read notes drawer and audio mini-player remain reachable', async ({ page }) => {
        const guard = installResponsiveErrorGuard(page);

        await loginThroughAdminForm(page, authConfig.email!, authConfig.password!, '/notes');
        const readPath = await resolveReadPath(page);
        if (!readPath) {
            test.skip(true, 'No readable content path was available; set RESPONSIVE_READ_PATH for this environment.');
            return;
        }

        await page.goto(readPath, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });

        const notesOpener = page.getByLabel('Open notes drawer');
        const drawer = page.getByTestId('reader-notes-drawer');
        await expectOverlayCloseRestoresFocusAndScroll(page, {
            opener: notesOpener,
            overlay: drawer,
            open: async () => {
                await notesOpener.click();
                await expect(drawer).toHaveAttribute('data-state', 'open', { timeout: 20_000 });
            },
            close: async () => {
                await page.getByLabel('Close notes drawer').click();
            },
            assertClosed: async () => {
                await expect(drawer).toHaveAttribute('data-state', 'closed', { timeout: 20_000 });
            },
        });

        const playButton = page.getByRole('button', { name: /^play$/i }).first();
        if (await playButton.count() > 0) {
            await playButton.click().catch(() => undefined);
            await page.mouse.wheel(0, 700);

            const miniPlayer = page.getByRole('region', { name: /audio mini player/i });
            if (await miniPlayer.count() > 0 && await miniPlayer.isVisible()) {
                await expectElementContainedInViewport(miniPlayer, { tolerance: 2 });
                await expectLocatorCenterNotCovered(notesOpener);
            }
        }

        await expectNoDocumentHorizontalScroll(page);
        guard.assertNoCriticalErrors();
    });
});
