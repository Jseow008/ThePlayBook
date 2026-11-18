import { test, expect } from '@playwright/test';

test('landing page loads and renders correctly', async ({ page }) => {
    await page.goto('/');

    // Verify the hero heading exists
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    const heroSection = heading.locator('xpath=ancestor::section[1]');

    // Reset entrance animations to their delayed starting state. Content must
    // remain readable there, not merely become visible once the animation ends.
    const reveals = heroSection.locator('.landing-hero-reveal');
    await reveals.evaluateAll(elements => elements.forEach(element => {
        element.getAnimations().forEach(animation => {
            animation.pause();
            animation.currentTime = 0;
        });
    }));
    for (const reveal of await reveals.all()) {
        await expect(reveal).toHaveCSS('opacity', '1');
        await expect(reveal).toHaveCSS('filter', 'none');
    }

    // Discovery now starts in the library; signup remains in the final CTA.
    await expect(heroSection.getByRole('link')).toHaveCount(0);
    const library = page.getByRole('region', { name: 'Explore the library' });
    await expect(library).toBeVisible();
    await expect(library.getByRole('link', { name: 'Browse all', exact: true })).toHaveAttribute('href', '/browse');
    await expect(library.getByRole('link', { name: 'Browse all', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Build Your Library Free', exact: true })).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: 'Build Your Library Free', exact: true })).toBeVisible();
});

test('browse page loads and renders correctly', async ({ page }) => {
    await page.goto('/browse');

    // Verify the main content area loads
    await expect(page.locator('main, [class*="HomeFeed"], [class*="hero"]').first()).toBeVisible({ timeout: 10000 });
});

test('landing library Browse all navigates to browse', async ({ page }) => {
    await page.goto('/');
    const library = page.getByRole('region', { name: 'Explore the library' });

    // Exercise the library's client-side navigation, not header/footer links.
    await library.getByRole('link', { name: 'Browse all', exact: true }).click();

    // Should navigate to /browse
    await page.waitForURL(/\/browse/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/browse/);
});

test('landing featured card opens its preview on a simple click', async ({ page, isMobile }) => {
    await page.goto('/');
    const card = page.getByTestId('featured-reads-group-b').getByRole('link').first();
    await expect(card).toBeVisible();
    const href = await card.getAttribute('href');
    expect(href).toMatch(/^\/preview\//);

    if (isMobile) await card.tap();
    else await card.click();

    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator('h1')).toBeVisible();
});

test('landing shelf controls preserve explicit pause and resume', async ({ page }) => {
    await page.goto('/');
    const carousel = page.getByTestId('featured-reads-carousel');
    await expect(carousel).toBeVisible();
    const pause = page.getByRole('button', { name: 'Pause featured reads', exact: true });
    if (await page.getByTestId('featured-reads-group-b').getByRole('link').count() < 2) {
        await expect(pause).toHaveCount(0);
        return;
    }

    await pause.click();
    const play = page.getByRole('button', { name: 'Play featured reads', exact: true });
    await expect(play).toBeVisible();
    const initial = await carousel.evaluate(element => element.scrollLeft);
    await page.getByRole('button', { name: 'Next featured reads', exact: true }).click();
    await expect.poll(() => carousel.evaluate(element => element.scrollLeft)).not.toBe(initial);
    await page.getByRole('button', { name: 'Previous featured reads', exact: true }).click();
    await expect.poll(() => carousel.evaluate(element => element.scrollLeft)).toBe(initial);
    await expect(play).toBeVisible();

    await play.click();
    await page.mouse.move(0, 0);
    await expect(pause).toBeVisible();
    await expect.poll(() => carousel.evaluate(element => element.scrollLeft)).not.toBe(initial);
});

test('landing mouse drag scrolls without opening a card', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Native touch swipes are covered by responsive-surfaces-public.spec.ts.');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const carousel = page.getByTestId('featured-reads-carousel');
    await expect(carousel).toBeVisible();
    const box = await carousel.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error('Missing carousel bounds');
    const x = box.x + Math.min(box.width * 0.6, 350);
    const y = box.y + 100;
    await page.mouse.move(x, y);
    const initial = await carousel.evaluate(element => element.scrollLeft);
    const navigated = page.waitForURL(/\/preview\//, { timeout: 700 }).then(() => true, () => false);
    await page.mouse.down();
    await page.mouse.move(x - 120, y, { steps: 6 });
    await page.mouse.up();

    await expect.poll(() => carousel.evaluate(element => element.scrollLeft)).not.toBe(initial);
    expect(await navigated).toBe(false);
    await expect(page).toHaveURL(/\/$/);

    const card = page.getByTestId('featured-reads-group-b').getByRole('link').first();
    const href = await card.getAttribute('href');
    await card.focus();
    await card.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test('public layout chrome is excluded on landing and present on browse', async ({ page }) => {
    await page.goto('/');

    // Landing page should not include app-shell nav links
    await expect(page.locator('a[href="/focus"]')).toHaveCount(0);
    await expect(page.locator('a[href="/search"]')).toHaveCount(0);

    await page.goto('/browse');

    // Browse page should include app-shell nav links
    await expect(page.locator('a[href="/focus"]').first()).toBeAttached();
    await expect(page.locator('a[href="/search"]').first()).toBeAttached();
});
