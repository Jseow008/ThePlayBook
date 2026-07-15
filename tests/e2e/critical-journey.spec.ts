import { test, expect } from '@playwright/test';
import { GUEST_ONBOARDING_STORAGE_KEY, createGuestOnboardingEntry } from '@/lib/onboarding';

test.describe('Critical User Journey', () => {
    test('browse -> preview -> read', async ({ page }) => {
        await page.addInitScript(
            ({ storageKey, onboardingState }) => {
                window.localStorage.setItem(storageKey, JSON.stringify(onboardingState));
            },
            {
                storageKey: GUEST_ONBOARDING_STORAGE_KEY,
                onboardingState: createGuestOnboardingEntry("completed"),
            }
        );

        // Step 1: Browse
        await page.goto('/browse');

        // Wait for feed to load and click the first content card's link
        // Find links that go to /preview/...
        const previewLink = page.locator('a[href^="/preview/"]').first();
        await expect(previewLink).toBeVisible({ timeout: 15000 }); // Wait for content to load

        const previewHref = await previewLink.getAttribute('href');
        expect(previewHref).toBeTruthy();

        // Click the card to go to preview
        await previewLink.click();

        // Step 2: Preview
        await expect(page).toHaveURL(new RegExp('/preview/'), { timeout: 15000 });

        // Wait for preview content to load
        // Expect a title and the current reader CTA
        const titleHeading = page.locator('h1').first();
        await expect(titleHeading).toBeVisible({ timeout: 15000 });

        const readCta = page.getByRole('link', { name: /read summary/i }).first();
        await expect(readCta).toBeVisible({ timeout: 15000 });

        const readHref = await readCta.getAttribute('href');
        expect(readHref).toBeTruthy();
        expect(readHref).toContain('/read/');

        // Click the read CTA (force true to bypass if viewport hides one of the responsive variants)
        await readCta.click({ force: true });

        // Step 3: Read - Wait for navigation to /read/[id]
        await page.waitForURL(/\/read\//, { timeout: 20000 });
        await expect(page).toHaveURL(new RegExp('/read/'), { timeout: 20000 });

        // Wait for reader to load
        const readerContent = page.locator('main').first();
        await expect(readerContent).toBeVisible();

        // Verify a segment or title is rendered
        // The reader layout accordion buttons have role="button" and segment titles
        const firstSegmentToggle = page.locator('button[aria-expanded]').first();
        await expect(firstSegmentToggle).toBeVisible();

        // Ensure the settings menu or highlight tools are rendered
        // E.g., looking for the Ask/Chat functionality or Settings trigger
        const settingsTrigger = page.locator('button[aria-label="Display Settings"]').first();
        await expect(settingsTrigger).toBeVisible();
    });
});
