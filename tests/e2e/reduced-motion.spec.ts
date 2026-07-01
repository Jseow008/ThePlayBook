import { expect, test, type Locator, type Page } from '@playwright/test';
import {
    completeGuestOnboarding,
    expectNoDocumentHorizontalScroll,
    installResponsiveErrorGuard,
} from './helpers/responsive';

function readPathFromPreviewPath(previewPath: string | null) {
    if (!previewPath) return null;

    const { pathname } = new URL(previewPath, 'http://localhost');
    const match = pathname.match(/^\/preview\/([^/]+)$/);

    return match ? `/read/${match[1]}` : null;
}

async function resolvePublicReadPath(page: Page) {
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

async function expectNoAnimatedTransition(locator: Locator, property: 'animationDuration' | 'transitionDuration' = 'transitionDuration') {
    await expect(locator).toBeVisible();

    const duration = await locator.evaluate((element, cssProperty) => window.getComputedStyle(element)[cssProperty], property);

    expect(duration, `${property} should be disabled under prefers-reduced-motion`).toMatch(/^(0s|0ms)(,\s*(0s|0ms))*$/);
}

async function expectNoTransform(locator: Locator) {
    await expect(locator).toBeVisible();

    const transform = await locator.evaluate((element) => window.getComputedStyle(element).transform);

    expect(transform).toBe('none');
}

test.describe('reduced motion browser behavior', () => {
    test.beforeEach(async ({ page }) => {
        await completeGuestOnboarding(page);
        await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    test('browse cards keep controls usable without decorative hover motion', async ({ page }) => {
        const guard = installResponsiveErrorGuard(page);

        await page.goto('/browse', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });

        const card = page.locator('.content-card-motion-surface').first();
        if (await card.count() === 0) {
            test.skip(true, 'No content cards were available on /browse for this data set.');
        }

        await card.hover();
        await expectNoTransform(card);
        await expectNoAnimatedTransition(card);

        const image = page.locator('.content-card-motion-image').first();
        if (await image.count() > 0) {
            await expectNoTransform(image);
            await expectNoAnimatedTransition(image);
        }

        const action = card.locator('.content-card-hover-action').first();
        if (await action.count() > 0) {
            await expect(action).toBeVisible();
            await expectNoAnimatedTransition(action);
        }

        await expectNoDocumentHorizontalScroll(page);
        guard.assertNoCriticalErrors();
    });

    test('reader notes drawer snaps state changes without transition travel', async ({ page }) => {
        test.setTimeout(60_000);

        const guard = installResponsiveErrorGuard(page);
        const readPath = await resolvePublicReadPath(page);

        if (!readPath) {
            test.skip(true, 'No readable content path was available; set RESPONSIVE_READ_PATH for this environment.');
            return;
        }

        await page.goto(readPath, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });

        const mobileHeader = page.getByTestId('mobile-header');
        if (await mobileHeader.count() > 0 && await mobileHeader.isVisible()) {
            await expectNoAnimatedTransition(mobileHeader);
        }

        const opener = page.getByLabel('Open notes drawer');
        await opener.hover();
        await expectNoTransform(opener);
        await expectNoAnimatedTransition(opener);

        await opener.click();

        const drawer = page.getByTestId('reader-notes-drawer');
        await expect(drawer).toHaveAttribute('data-state', 'open', { timeout: 20_000 });
        await expectNoAnimatedTransition(drawer);

        await page.keyboard.press('Escape');
        await expect(drawer).toHaveAttribute('data-state', 'closed', { timeout: 20_000 });

        await expectNoDocumentHorizontalScroll(page);
        guard.assertNoCriticalErrors();
    });
});
