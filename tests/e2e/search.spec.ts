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

    test('clears a no-result type filter without clearing the search query', async ({ page }) => {
        const searchTerm = `unmatched-${Date.now()}`;
        await page.goto(`/search?q=${searchTerm}&type=book`);

        await expect(page.getByRole('heading', { name: 'No results found' })).toBeVisible();
        await expect(page.getByText("We couldn't find anything matching that title, author, category, or filter.")).toBeVisible();

        await page.getByRole('link', { name: 'Clear all filters' }).click();
        await expect(page).toHaveURL((url) => url.pathname === '/search'
            && url.searchParams.get('q') === searchTerm
            && !url.searchParams.has('type')
            && !url.searchParams.has('category'));
        await expect(page.getByRole('searchbox', { name: /search content/i })).toHaveValue(searchTerm);
    });

    test('offers a reset when filters alone return no content', async ({ page }) => {
        await page.goto('/search?category=Christianity&type=article');
        await expect(page.getByText('No content matches these filters.')).toBeVisible();
        await page.getByRole('link', { name: 'Clear all filters' }).click();
        await expect(page).toHaveURL((url) => url.pathname === '/search' && !url.search);
    });

    test('shows the approved topics and preserves selection across reload and Back', async ({ page }) => {
        await page.goto('/search?q=faith&type=book&category=Religion+%26+Spirituality');
        await expect(page).toHaveURL((url) => url.pathname === '/search'
            && url.searchParams.get('q') === 'faith'
            && url.searchParams.get('type') === 'book'
            && !url.searchParams.has('category'));

        const narrow = page.getByRole('combobox', { name: 'Topics', exact: true });
        const isNarrow = await narrow.isVisible();
        const picker = isNarrow ? narrow : page.getByRole('combobox', { name: 'More topics' });
        await expect(picker.locator('option')).toHaveCount(isNarrow ? 19 : 13);
        await expect(picker.locator('option', { hasText: 'Religion & Spirituality' })).toHaveCount(0);
        if (isNarrow) {
            expect((await picker.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        }

        await picker.selectOption('Christianity');
        await expect(page).toHaveURL((url) => url.searchParams.get('category') === 'Christianity'
            && url.searchParams.get('q') === 'faith'
            && url.searchParams.get('type') === 'book');
        await expect(picker).toHaveValue('Christianity');
        await page.reload();
        await expect(picker).toHaveValue('Christianity');
        await page.goBack();
        await expect(picker).toHaveValue('');
    });

    test('preserves category when switching type filters', async ({ page }) => {
        await page.goto('/search?category=Money+%26+Investments');

        await expect(page.getByRole('heading', { name: 'Money & Investments Content' })).toBeVisible();

        await page.getByRole('link', { name: 'Podcast' }).click();
        await page.waitForURL(/\/search\?category=Money(?:\+|%20)%26(?:\+|%20)Investments&type=podcast$/);

        await expect(page.getByRole('heading', { name: 'Money & Investments Content' })).toBeVisible();
    });

    test('preserves two filter choices made before the first navigation settles', async ({ page }) => {
        await page.goto('/search?type=podcast');
        const compactTopics = page.getByRole('combobox', { name: 'Topics', exact: true });
        const useCompactTopics = await compactTopics.isVisible();
        if (useCompactTopics) await expect(compactTopics).toBeVisible();
        else await expect(page.locator('a[href*="category="]').first()).toBeVisible();
        // Server-rendered controls can be visible before their client navigation
        // handlers hydrate. Exercise rapid in-app clicks only after both do.
        await page.waitForFunction((compact) => {
            const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/search"]'));
            const book = links.find((link) => link.textContent?.trim() === 'Book');
            const topic = compact
                ? document.getElementById('search-topic-select-all')
                : links.find((link) => new URL(link.href).searchParams.has('category'));
            return [book, topic].every((link) =>
                link && Object.keys(link).some((key) => key.startsWith('__reactProps$')),
            );
        }, useCompactTopics);

        const topic = await page.evaluate((compact) => {
            const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/search"]'));
            const book = links.find((link) => link.textContent?.trim() === 'Book');
            if (compact) {
                const select = document.querySelector<HTMLSelectElement>('#search-topic-select-all');
                const option = select?.options[1];
                if (!book || !select || !option?.value) throw new Error('Search filters did not render');
                book.click();
                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return { category: option.value, label: option.textContent?.trim() ?? option.value };
            }
            const topicLink = links.find((link) => new URL(link.href).searchParams.has('category'));
            if (!book || !topicLink) throw new Error('Search filters did not render');
            const category = new URL(topicLink.href).searchParams.get('category');
            const label = topicLink.textContent?.trim();
            if (!category || !label) throw new Error('Search topic is missing its category or label');
            book.click();
            topicLink.click();
            return { category, label };
        }, useCompactTopics);

        await expect(page).toHaveURL((url) =>
            url.pathname === '/search'
            && url.searchParams.get('category') === topic.category
            && url.searchParams.get('type') === 'book',
        );
        await expect(page.getByRole('link', { name: 'Book', exact: true })).toHaveClass(/bg-primary/);
        if (useCompactTopics) await expect(compactTopics).toHaveValue(topic.category);
        else await expect(page.getByRole('link', { name: topic.label, exact: true })).toHaveClass(/bg-primary/);
    });

    test('keeps a newly typed query when its type filter is changed immediately', async ({ page }) => {
        await page.goto('/search?type=podcast');
        const input = page.getByRole('searchbox', { name: /search content/i });
        const book = page.getByRole('link', { name: 'Book', exact: true });
        await expect(book).toBeVisible();
        await page.waitForFunction(() => {
            const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/search"]'))
                .find((element) => element.textContent?.trim() === 'Book');
            return link && Object.keys(link).some((key) => key.startsWith('__reactProps$'));
        });

        await input.fill('Google');
        await book.click();
        // Let the debounced query navigation run before checking the final state.
        await page.waitForTimeout(700);
        await expect(page).toHaveURL((url) => url.pathname === '/search'
            && url.searchParams.get('q') === 'Google'
            && url.searchParams.get('type') === 'book');
        await expect(page.getByRole('link', { name: 'Book', exact: true })).toHaveClass(/bg-primary/);
    });

    test('falls back to All when an invalid type parameter is provided', async ({ page }) => {
        await page.goto('/search?type=invalid');

        const allChip = page.getByRole('link', { name: 'All', exact: true });
        await expect(allChip).toBeVisible();
        await expect(allChip).toHaveClass(/bg-primary/);
        await expect(page.getByRole('heading', { name: 'Find Content' })).toBeVisible();
    });
});
