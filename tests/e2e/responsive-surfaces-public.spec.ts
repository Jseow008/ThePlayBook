import { expect, test, type Locator, type Page } from '@playwright/test';
import {
    completeGuestOnboarding,
    expectElementContainedInViewport,
    expectIntentionalHorizontalScroller,
    expectNoDocumentHorizontalScroll,
    expectOverlayCloseRestoresFocusAndScroll,
    installResponsiveErrorGuard,
} from './helpers/responsive';

async function hasHorizontalOverflow(locator: Locator) {
    if (await locator.count() === 0) return false;

    return locator.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
}

async function waitForHorizontalOverflow(locator: Locator) {
    try {
        await expect.poll(() => hasHorizontalOverflow(locator), { timeout: 10_000 }).toBe(true);
        return true;
    } catch {
        return false;
    }
}

async function firstOverflowingLocator(page: Page, testId: string) {
    const locators = page.getByTestId(testId);
    const count = await locators.count();

    for (let index = 0; index < count; index += 1) {
        const candidate = locators.nth(index);
        if (await hasHorizontalOverflow(candidate)) {
            return candidate;
        }
    }

    return null;
}

test.describe('responsive public high-risk surfaces', () => {
    test.beforeEach(async ({ page }) => {
        await completeGuestOnboarding(page);
    });

    test('landing hero CTA and featured reads stay contained', async ({ page }) => {
        const guard = installResponsiveErrorGuard(page);

        await page.goto('/', { waitUntil: 'domcontentloaded' });

        const heroCta = page.getByRole('link', { name: /explore a summary/i });
        await expect(heroCta).toBeVisible({ timeout: 20_000 });
        await heroCta.click({ trial: true });
        await expectNoDocumentHorizontalScroll(page);

        const carousel = page.getByTestId('featured-reads-carousel');
        if (!(await waitForHorizontalOverflow(carousel))) {
            test.skip(true, 'Landing featured reads carousel is unavailable for this data set.');
        }

        await expect(carousel).toHaveCount(1);
        await expectIntentionalHorizontalScroller(page, carousel);
        guard.assertNoCriticalErrors();
    });

    test('landing featured reads responds to a native touch swipe', async ({ page }) => {
        test.skip(!page.context().browser()?.browserType().name().includes('chromium'), 'Touch gesture probe uses Chromium CDP.');
        test.skip((page.viewportSize()?.width ?? 0) >= 768, 'Touch gesture probe runs at mobile widths.');

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        const carousel = page.getByTestId('featured-reads-carousel');
        if (!(await waitForHorizontalOverflow(carousel))) {
            test.skip(true, 'Landing featured reads carousel is unavailable for this data set.');
        }

        await expect(carousel).toHaveCount(1);
        await carousel.scrollIntoViewIfNeeded();
        await expect(carousel).toHaveCSS('touch-action', 'auto');
        const box = await carousel.boundingBox();
        expect(box).not.toBeNull();
        if (!box) return;

        const startX = box.x + box.width * 0.8;
        const y = box.y + Math.min(box.height / 2, 120);
        const initialScrollLeft = await carousel.evaluate((element) => element.scrollLeft);
        const cdp = await page.context().newCDPSession(page);

        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x: startX, y }],
        });
        for (let step = 1; step <= 5; step += 1) {
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x: startX - step * 35, y }],
            });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

        await expect.poll(async () => carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(initialScrollLeft + 40);
    });

    test('browse hero and content lanes keep horizontal scrolling scoped', async ({ page }) => {
        const guard = installResponsiveErrorGuard(page);

        await page.goto('/browse', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });

        const heroContent = page.getByTestId('hero-carousel-content');
        if (await heroContent.count() > 0) {
            await expectElementContainedInViewport(heroContent, { tolerance: 2 });
        }

        const laneScroller = await firstOverflowingLocator(page, 'content-lane-scroller');
        if (!laneScroller) {
            test.skip(true, 'No overflowing browse content lane was available for this data set.');
            return;
        }

        await expectIntentionalHorizontalScroller(page, laneScroller);

        const viewport = page.viewportSize();
        if (viewport && viewport.width >= 768) {
            await laneScroller.evaluate((element) => {
                element.scrollLeft = 0;
            });

            const rightArrow = page.getByLabel('Scroll right').first();
            await expect(rightArrow).toBeVisible();
            await rightArrow.click();
            await expect
                .poll(async () => laneScroller.evaluate((element) => element.scrollLeft), {
                    message: 'Content lane right arrow did not advance the lane',
                })
                .toBeGreaterThan(0);
        }

        guard.assertNoCriticalErrors();
    });

    test('focus cards fit the viewport and mobile takeaways sheet restores state', async ({ page }) => {
        const guard = installResponsiveErrorGuard(page);

        await page.goto('/focus', { waitUntil: 'domcontentloaded' });
        const card = page.getByTestId('focus-feed-card').first();
        if (await card.count() === 0) {
            test.skip(true, 'No focus feed cards were available for this data set.');
        }

        await expect(card).toBeVisible({ timeout: 20_000 });
        await expectElementContainedInViewport(card, { tolerance: 2 });
        await expectElementContainedInViewport(page.getByTestId('focus-card-content').first(), { tolerance: 2 });
        await expectNoDocumentHorizontalScroll(page);

        const viewport = page.viewportSize();
        if (!viewport || viewport.width >= 768) {
            guard.assertNoCriticalErrors();
            return;
        }

        const opener = page.getByTestId('focus-takeaways-opener').first();
        if (await opener.count() === 0) {
            test.skip(true, 'No mobile focus takeaways opener was available for this data set.');
        }

        await expectOverlayCloseRestoresFocusAndScroll(page, {
            opener,
            overlay: page.getByTestId('focus-takeaways-sheet'),
            open: async () => {
                await opener.click();
            },
            close: async () => {
                await page.getByTestId('focus-takeaways-sheet-close').click();
            },
            scrollTolerance: 8,
        });

        guard.assertNoCriticalErrors();
    });
});
