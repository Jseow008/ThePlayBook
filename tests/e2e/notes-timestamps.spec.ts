import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { expect, test } from '@playwright/test';

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const loopback = (url: string) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
const createdAt = '2026-11-14T16:43:01.133Z';
test.use({ trace: 'off' });

for (const [timezoneId, localTime] of [
    ['UTC', 'Nov 14, 4:43 PM'],
    ['Asia/Singapore', 'Nov 15, 12:43 AM'],
    ['America/Los_Angeles', 'Nov 14, 8:43 AM'],
]) {
    test.describe(timezoneId, () => {
        test.use({ timezoneId });
        test('Notes dates hydrate without recovery and retain local time', async ({ page, context, baseURL }) => {
            test.skip(!apiUrl || !anonKey || !serviceKey, 'Requires disposable local Supabase credentials.');
            if (!loopback(apiUrl!) || !baseURL || !loopback(baseURL)) throw new Error('Timestamp fixture requires loopback app and Supabase URLs.');
            const admin = createClient(apiUrl!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
            const password = `${randomUUID()}Aa1!`;
            const created = await admin.auth.admin.createUser({
                email: `notes-time-${randomUUID()}@example.invalid`, password, email_confirm: true,
            });
            expect(created.error).toBeNull();
            const userId = created.data.user!.id;
            const cookies: Array<{ name: string; value: string }> = [];
            const auth = createServerClient(apiUrl!, anonKey!, { cookies: {
                getAll: () => cookies,
                setAll: (values: Array<{ name: string; value: string }>) => { for (const cookie of values) {
                    const index = cookies.findIndex(value => value.name === cookie.name);
                    if (index >= 0) cookies.splice(index, 1);
                    cookies.push(cookie);
                } },
            } });
            let releaseScripts: (() => void) | undefined;
            try {
                const source = await admin.from('content_item').select('id').eq('id', '11111111-1111-4111-8111-111111111111').single();
                expect(source.error).toBeNull();
                expect((await admin.from('user_reflections').insert({ user_id: userId, content_item_id: source.data!.id,
                    prompt: 'Timestamp regression', reflection_text: 'Temporary timestamp regression reflection.', created_at: createdAt,
                })).error).toBeNull();
                expect((await auth.auth.signInWithPassword({ email: created.data.user!.email!, password })).error).toBeNull();
                await context.addCookies(cookies.map(cookie => ({ ...cookie, domain: new URL(baseURL).hostname, path: '/', sameSite: 'Lax' as const })));
                const errors: string[] = [];
                page.on('pageerror', error => errors.push(error.message));
                // Hydrate the completed server HTML, rather than letting early client updates mask a mismatch.
                const scripts = new Promise<void>(resolve => { releaseScripts = resolve; });
                await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async route => { await scripts; await route.continue(); });
                const response = await page.goto('/notes?type=reflection', { waitUntil: 'commit' });
                expect(response?.status()).toBe(200);
                const html = await response!.text();
                expect(html).toMatch(/<time[^>]*>Nov 14, 4:43 PM UTC<\/time>/);
                releaseScripts?.();
                // Next may retain an inactive server tree while the visible page commits.
                const timestamp = page.locator('time:visible');
                await expect(timestamp).toHaveText(localTime, { timeout: 15000 });
                expect(new Date((await timestamp.getAttribute('datetime'))!).toISOString()).toBe(createdAt);
                const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
                await page.getByRole('button', { name: desktop ? 'Ask these notes' : 'Ask', exact: true }).click();
                await expect(page.getByLabel(desktop ? 'Ask a question about the notes in view' : 'Ask a question about these notes', { exact: true })).toBeVisible();
                expect(errors).toEqual([]);
            } finally {
                releaseScripts?.();
                try { await auth.auth.signOut({ scope: 'global' }); }
                finally { expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull(); }
            }
        });
    });
}
