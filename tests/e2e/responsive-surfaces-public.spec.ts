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

        const heroCta = page.getByRole('link', { name: /explore the library/i });
        await expect(heroCta).toBeVisible({ timeout: 20_000 });
        await heroCta.click({ trial: true });
        await expectNoDocumentHorizontalScroll(page);

        const carousel = page.getByTestId('featured-reads-carousel');
        if (await carousel.count() === 0 || !(await hasHorizontalOverflow(carousel))) {
            test.skip(true, 'Landing featured reads carousel is unavailable for this data set.');
        }

        await expectIntentionalHorizontalScroller(page, carousel);
        guard.assertNoCriticalErrors();
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
