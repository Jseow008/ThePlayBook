import { test, expect } from '@playwright/test';

test.describe('/search', () => {
    test('does not auto-open recent searches on load, but shows them on focus', async ({ page }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem('netflux_recent_searches', JSON.stringify(['Deep Work', 'Atomic Habits']));
        });

        await page.goto('/search');

        await expect(page.getByRole('heading', { name: 'Find Content' })).toBeVisible();
        await expect(page.getByText('Recent Searches')).toHaveCount(0);

        const searchInput = page.getByRole('searchbox', { name: /search content/i });
        await searchInput.click();

        await expect(page.getByText('Recent Searches')).toBeVisible();
        await expect(page.getByRole('button', { name: /^deep work$/i })).toBeVisible();
    });

    test('keeps the query string in sync when searching and clearing', async ({ page }) => {
        await page.goto('/search');

        const searchInput = page.getByRole('searchbox', { name: /search content/i });
        const searchTerm = `focus-${Date.now()}`;

        await searchInput.fill(searchTerm);
        await page.waitForURL(new RegExp(`/search\\?q=${searchTerm}`));

        await expect(page.getByText('No results found')).toBeVisible();

        await page.getByRole('button', { name: /clear search/i }).click();
        await page.waitForURL(/\/search$/);

        await expect(searchInput).toHaveValue('');
    });

    test('preserves category when switching type filters', async ({ page }) => {
        await page.goto('/search?category=Finance');

        await expect(page.getByRole('heading', { name: 'Money & Investments Content' })).toBeVisible();

        await page.getByRole('link', { name: 'Podcast' }).click();
        await page.waitForURL(/\/search\?category=Money(?:\+|%20)%26(?:\+|%20)Investments&type=podcast$/);

        await expect(page.getByRole('heading', { name: 'Money & Investments Content' })).toBeVisible();
    });

    test('preserves two filter choices made before the first navigation settles', async ({ page }) => {
        await page.goto('/search?type=podcast');
        await expect(page.locator('a[href*="category="]').first()).toBeVisible();
        // Server-rendered links can be visible before their client navigation
        // handlers hydrate. Exercise rapid in-app clicks only after both do.
        await page.waitForFunction(() => {
            const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/search"]'));
            const book = links.find((link) => link.textContent?.trim() === 'Book');
            const topic = links.find((link) => new URL(link.href).searchParams.has('category'));
            return [book, topic].every((link) =>
                link && Object.keys(link).some((key) => key.startsWith('__reactProps$')),
            );
        });

        const topic = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/search"]'));
            const book = links.find((link) => link.textContent?.trim() === 'Book');
            const topicLink = links.find((link) => new URL(link.href).searchParams.has('category'));
            if (!book || !topicLink) throw new Error('Search filters did not render');
            const category = new URL(topicLink.href).searchParams.get('category');
            const label = topicLink.textContent?.trim();
            if (!category || !label) throw new Error('Search topic is missing its category or label');
            book.click();
            topicLink.click();
            return { category, label };
        });

        await expect(page).toHaveURL((url) =>
            url.pathname === '/search'
            && url.searchParams.get('category') === topic.category
            && url.searchParams.get('type') === 'book',
        );
        await expect(page.getByRole('link', { name: 'Book', exact: true })).toHaveClass(/bg-primary/);
        await expect(page.getByRole('link', { name: topic.label, exact: true })).toHaveClass(/bg-primary/);
    });

    test('falls back to All when an invalid type parameter is provided', async ({ page }) => {
        await page.goto('/search?type=invalid');

        const allChip = page.getByRole('link', { name: 'All', exact: true });
        await expect(allChip).toBeVisible();
        await expect(allChip).toHaveClass(/bg-primary/);
        await expect(page.getByRole('heading', { name: 'Find Content' })).toBeVisible();
    });
});
