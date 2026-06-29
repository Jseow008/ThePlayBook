import { expect, type Locator, type Page } from '@playwright/test';
import {
    GUEST_ONBOARDING_STORAGE_KEY,
    createGuestOnboardingEntry,
} from '@/lib/onboarding';

const HIDDEN_HEADER_TRANSFORM = /^matrix\(1, 0, 0, 1, 0, -[0-9.]+\)$/;
const VISIBLE_HEADER_TRANSFORM = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/;

const DEFAULT_CONSOLE_ALLOWLIST = [
    /Failed to load resource: the server responded with a status of 404/i,
    /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/i,
    /The resource .* was preloaded using link preload but not used/i,
];

export interface ResponsiveErrorGuard {
    assertNoCriticalErrors: () => void;
}

export function installResponsiveErrorGuard(
    page: Page,
    allowlist: RegExp[] = DEFAULT_CONSOLE_ALLOWLIST
): ResponsiveErrorGuard {
    const criticalErrors: string[] = [];

    page.on('console', (message) => {
        if (message.type() !== 'error') return;

        const text = message.text();
        if (allowlist.some((pattern) => pattern.test(text))) return;

        criticalErrors.push(`console.error: ${text}`);
    });

    page.on('pageerror', (error) => {
        criticalErrors.push(`pageerror: ${error.message}`);
    });

    return {
        assertNoCriticalErrors() {
            expect(criticalErrors, criticalErrors.join('\n')).toEqual([]);
        },
    };
}

export async function completeGuestOnboarding(page: Page) {
    await page.addInitScript(
        ({ storageKey, onboardingState }) => {
            window.localStorage.setItem(storageKey, JSON.stringify(onboardingState));
        },
        {
            storageKey: GUEST_ONBOARDING_STORAGE_KEY,
            onboardingState: createGuestOnboardingEntry('completed'),
        }
    );
}

export async function expectNoDocumentHorizontalScroll(page: Page) {
    const dimensions = await page.evaluate(() => ({
        bodyScrollWidth: document.body?.scrollWidth ?? 0,
        documentScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
    }));

    const maxScrollWidth = Math.max(dimensions.bodyScrollWidth, dimensions.documentScrollWidth);

    expect(
        maxScrollWidth,
        `Document overflows horizontally: max scrollWidth ${maxScrollWidth}, viewport ${dimensions.innerWidth}`
    ).toBeLessThanOrEqual(dimensions.innerWidth + 1);
}

export async function expectFocusedElementVisible(page: Page) {
    await page.keyboard.press('Tab');

    const focusedState = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) {
            return { isVisible: false, tagName: null, rect: null };
        }

        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const isVisible =
            rect.width > 0
            && rect.height > 0
            && rect.bottom > 0
            && rect.right > 0
            && rect.top < window.innerHeight
            && rect.left < window.innerWidth
            && style.visibility !== 'hidden'
            && style.display !== 'none';

        return {
            isVisible,
            tagName: element.tagName,
            rect: {
                bottom: rect.bottom,
                height: rect.height,
                left: rect.left,
                right: rect.right,
                top: rect.top,
                width: rect.width,
            },
        };
    });

    expect(focusedState.isVisible, `Focused element is not visible: ${JSON.stringify(focusedState)}`).toBe(true);
}

export async function expectLocatorCenterNotCovered(locator: Locator) {
    await expect(locator).toBeVisible();

    const isTopElement = await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const visibleLeft = Math.max(rect.left, 0);
        const visibleRight = Math.min(rect.right, window.innerWidth);
        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, window.innerHeight);

        if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
            return false;
        }

        const x = visibleLeft + (visibleRight - visibleLeft) / 2;
        const y = visibleTop + (visibleBottom - visibleTop) / 2;
        const topElement = document.elementFromPoint(x, y);

        return topElement === element || element.contains(topElement);
    });

    expect(isTopElement).toBe(true);
}

export async function expectLocatorWithinViewport(locator: Locator) {
    await expect(locator).toBeVisible();

    const bounds = await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();

        return {
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
        };
    });

    expect(bounds.left, `Locator extends past the left viewport edge: ${JSON.stringify(bounds)}`).toBeGreaterThanOrEqual(0);
    expect(bounds.right, `Locator extends past the right viewport edge: ${JSON.stringify(bounds)}`).toBeLessThanOrEqual(bounds.viewportWidth + 1);
    expect(bounds.top, `Locator extends above the viewport: ${JSON.stringify(bounds)}`).toBeLessThanOrEqual(bounds.viewportHeight);
    expect(bounds.bottom, `Locator extends below the viewport: ${JSON.stringify(bounds)}`).toBeGreaterThanOrEqual(0);
}

export async function expectMobileChromeDoesNotCoverTarget(page: Page, target: Locator) {
    await expectLocatorWithinViewport(target);

    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 1024) return;

    await expectLocatorCenterNotCovered(target);
}

export async function expectMobileHeaderVisibilityAtScrollPositions(
    page: Page,
    options: { assertAutoHide?: boolean } = {}
) {
    const { assertAutoHide = true } = options;
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 1024) return;

    const header = page.getByTestId('mobile-header');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('transform', VISIBLE_HEADER_TRANSFORM);

    if (!assertAutoHide) {
        await expectLocatorWithinViewport(header);
        return;
    }

    const canScrollEnoughToHideHeader = await page.evaluate(
        () => document.documentElement.scrollHeight > window.innerHeight + 80
    );

    if (canScrollEnoughToHideHeader) {
        const scrollYAfterMove = await page.evaluate(() => {
            window.scrollTo(0, Math.min(600, document.documentElement.scrollHeight));
            return window.scrollY;
        });

        if (scrollYAfterMove > 50) {
            await expect(header).toBeAttached();
            await expect(header).toHaveCSS('transform', HIDDEN_HEADER_TRANSFORM);
        }
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('transform', VISIBLE_HEADER_TRANSFORM);
    await expectLocatorWithinViewport(header);
}

export async function expectResponsiveRouteHealth(page: Page, target?: Locator) {
    await expect(target ?? page.locator('main, body').first()).toBeVisible({ timeout: 20_000 });
    await expectNoDocumentHorizontalScroll(page);
    await expectFocusedElementVisible(page);
}

export function getResponsiveAuthConfig() {
    const email =
        process.env.RESPONSIVE_AUTH_EMAIL?.trim()
        || process.env.SMOKE_ADMIN_EMAIL?.trim()
        || process.env.E2E_ADMIN_EMAIL?.trim()
        || null;
    const password =
        process.env.RESPONSIVE_AUTH_PASSWORD?.trim()
        || process.env.SMOKE_ADMIN_PASSWORD?.trim()
        || process.env.E2E_ADMIN_PASSWORD?.trim()
        || null;

    return {
        email,
        password,
        skipReason: email && password
            ? null
            : 'Set RESPONSIVE_AUTH_EMAIL and RESPONSIVE_AUTH_PASSWORD, or SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD, to run authenticated responsive checks.',
    };
}

export async function loginThroughAdminForm(
    page: Page,
    email: string,
    password: string,
    destination = '/admin'
) {
    await page.goto('/admin-login');
    await page.getByPlaceholder('Email address').fill(email);
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin(?:\?.*)?$/, { timeout: 30_000 });

    if (destination !== '/admin') {
        return page.goto(destination);
    }

    return null;
}
