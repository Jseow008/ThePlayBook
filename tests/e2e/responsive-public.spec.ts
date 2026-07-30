import { expect, test, type Locator, type Page } from '@playwright/test';
import {
    completeGuestOnboarding,
    expectMobileChromeDoesNotCoverTarget,
    expectMobileHeaderVisibilityAtScrollPositions,
    expectFocusedInputVisibleAfterKeyboard,
    expectNoDocumentHorizontalScroll,
    expectResponsiveRouteHealth,
    installResponsiveErrorGuard,
} from './helpers/responsive';

interface PublicResponsiveRoute {
    chrome: 'immersive-with-bottom-nav' | 'standard' | 'standalone';
    path: string;
    target: (page: Page) => Locator;
}

const publicResponsiveRoutes: PublicResponsiveRoute[] = [
    {
        path: '/',
        chrome: 'standalone',
        target: (page) => page.locator('h1').first(),
    },
    {
        path: '/browse',
        chrome: 'standard',
        target: (page) => page.locator('main').first(),
    },
    {
        path: '/search',
        chrome: 'standard',
        target: (page) => page.getByRole('searchbox', { name: /search content/i }),
    },
    {
        path: '/requests',
        chrome: 'standard',
        target: (page) => page.getByRole('heading', { name: /request a summary/i }),
    },
    {
        path: '/focus',
        chrome: 'immersive-with-bottom-nav',
        target: (page) => page.locator('main').first(),
    },
];

function readPathFromPreviewPath(previewPath: string | null) {
    if (!previewPath) return null;

    const { pathname } = new URL(previewPath, 'http://localhost');
    const match = pathname.match(/^\/preview\/([^/]+)$/);

    return match ? `/read/${match[1]}` : null;
}

test.describe('responsive public routes', () => {
    test.beforeEach(async ({ page }) => {
        await completeGuestOnboarding(page);
    });

    for (const route of publicResponsiveRoutes) {
        test(`${route.path} has no unintended document overflow`, async ({ page }) => {
            const guard = installResponsiveErrorGuard(page);

            const response = await page.goto(route.path);
            expect(response?.ok() || response?.status() === 304).toBe(true);

            const target = route.target(page);
            await expectResponsiveRouteHealth(page, target);

            if (route.chrome === 'standalone') {
                await expect(page.getByTestId('mobile-header')).toHaveCount(0);
                await expect(page.getByTestId('mobile-bottom-nav')).toHaveCount(0);
            }

            if (route.chrome === 'standard') {
                await expectMobileChromeDoesNotCoverTarget(page, target);
                await expectMobileHeaderVisibilityAtScrollPositions(page);
            }

            if (route.chrome === 'immersive-with-bottom-nav') {
                await expect(page.getByTestId('mobile-header')).toHaveCount(0);
                await expectMobileChromeDoesNotCoverTarget(page, target);
            }

            guard.assertNoCriticalErrors();
        });
    }

    test('dynamic preview and read routes have no unintended document overflow', async ({ page }) => {
        test.setTimeout(60_000);

        const guard = installResponsiveErrorGuard(page);
        const configuredPreviewPath = process.env.RESPONSIVE_PREVIEW_PATH?.trim();
        const configuredReadPath = process.env.RESPONSIVE_READ_PATH?.trim() || process.env.SMOKE_READ_PATH?.trim();

        let previewPath = configuredPreviewPath || null;
        let readPath = configuredReadPath || null;

        if (!previewPath) {
            await page.goto('/browse', { waitUntil: 'domcontentloaded' });
            const previewLink = page.locator('a[href^="/preview/"]').first();

            if (await previewLink.count() === 0) {
                test.skip(true, 'No public preview link was available on /browse; set RESPONSIVE_PREVIEW_PATH and RESPONSIVE_READ_PATH for this environment.');
            }

            await expect(previewLink).toBeVisible({ timeout: 20_000 });
            previewPath = previewPath || await previewLink.getAttribute('href');
        }

        if (!readPath) {
            await page.goto(previewPath!, { waitUntil: 'domcontentloaded' });
            await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });
            const readLink = page.getByRole('link', { name: /read summary/i }).first();
            if (await readLink.count() > 0) {
                await expect(readLink).toBeVisible({ timeout: 5_000 });
                readPath = await readLink.getAttribute('href');
            }

            readPath = readPath || readPathFromPreviewPath(previewPath);
        }

        expect(previewPath).toBeTruthy();
        expect(readPath).toBeTruthy();

        await page.goto(previewPath!, { waitUntil: 'domcontentloaded' });
        await expectResponsiveRouteHealth(page, page.locator('main').first());
        await expect(page.getByTestId('mobile-bottom-nav')).toHaveCount(0);
        await expectMobileHeaderVisibilityAtScrollPositions(page, { assertAutoHide: false });

        await page.goto(readPath!, { waitUntil: 'domcontentloaded' });
        await expectResponsiveRouteHealth(page, page.locator('main').first());
        await expect(page.getByTestId('mobile-bottom-nav')).toHaveCount(0);
        await expectMobileHeaderVisibilityAtScrollPositions(page, { assertAutoHide: false });
        await expectNoDocumentHorizontalScroll(page);

        const libraryStateButton = page.getByRole('button', { name: /^Save .* to Library$/ });
        await expect(libraryStateButton).toBeEnabled({ timeout: 20_000 });
        const discussButton = page.getByRole('button', { name: 'Discuss ideas', exact: true });
        await expect(discussButton).toBeVisible();
        await discussButton.scrollIntoViewIfNeeded();
        await discussButton.focus();
        const scrollYBeforeChat = await page.evaluate(() => window.scrollY);
        await discussButton.click();

        const authorChat = page.getByTestId('author-chat-dialog');
        const authorChatInput = authorChat.getByRole('textbox');
        const closeChatButton = authorChat.getByRole('button', { name: 'Close chat', exact: true });
        const sendMessageButton = authorChat.getByRole('button', { name: 'Send message', exact: true });
        await expect(authorChat).toBeVisible({ timeout: 20_000 });

        const viewport = page.viewportSize();
        const chatState = await authorChat.evaluate((dialog) => {
            const input = dialog.querySelector('textarea');
            const dialogRect = dialog.getBoundingClientRect();
            const inputFontSize = input ? Number.parseFloat(window.getComputedStyle(input).fontSize) : 0;
            const readerMain = document.querySelector('main');
            const backgroundRoot = Array.from(document.body.children)
                .find((element) => readerMain && element.contains(readerMain));

            return {
                activeElementIsDialog: document.activeElement === dialog,
                activeElementIsInput: document.activeElement === input,
                backgroundAriaHidden: backgroundRoot?.getAttribute('aria-hidden'),
                backgroundInert: backgroundRoot instanceof HTMLElement ? backgroundRoot.inert : false,
                backgroundPointerEvents: backgroundRoot instanceof HTMLElement
                    ? backgroundRoot.style.pointerEvents
                    : '',
                bodyPosition: document.body.style.position,
                dialogBottom: dialogRect.bottom,
                dialogLeft: dialogRect.left,
                dialogRight: dialogRect.right,
                dialogTop: dialogRect.top,
                inputFontSize,
            };
        });

        expect(chatState.dialogLeft).toBeGreaterThanOrEqual(-1);
        expect(chatState.dialogTop).toBeGreaterThanOrEqual(-1);
        expect(chatState.dialogRight).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
        expect(chatState.dialogBottom).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
        expect(chatState.bodyPosition).toBe('fixed');
        expect(chatState.backgroundAriaHidden).toBe('true');
        expect(chatState.backgroundInert).toBe(true);
        expect(chatState.backgroundPointerEvents).toBe('none');

        const usesMobileInteraction = (viewport?.width ?? 0) < 640
            || await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);

        if (usesMobileInteraction) {
            expect(chatState.activeElementIsDialog).toBe(true);
            expect(chatState.activeElementIsInput).toBe(false);
            expect(chatState.inputFontSize).toBeGreaterThanOrEqual(16);

            for (const control of [closeChatButton, sendMessageButton]) {
                const box = await control.boundingBox();
                expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
                expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
            }
        } else {
            expect(chatState.activeElementIsInput).toBe(true);
        }

        await expectFocusedInputVisibleAfterKeyboard(page, authorChatInput);
        await expectNoDocumentHorizontalScroll(page);
        await closeChatButton.click();
        await expect(authorChat).toHaveCount(0);
        await expect(discussButton).toBeFocused();
        expect(await page.evaluate(() => document.body.style.position)).not.toBe('fixed');
        expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollYBeforeChat)).toBeLessThanOrEqual(4);

        guard.assertNoCriticalErrors();
    });
});
