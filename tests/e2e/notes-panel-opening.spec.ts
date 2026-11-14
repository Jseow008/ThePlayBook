import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { expect, test } from '@playwright/test';

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const loopback = (url: string) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);

test.use({ trace: 'off' });
test('Notes opening retains a pending response and its context', async ({ page, context, baseURL }) => {
    test.skip(!apiUrl || !anonKey || !serviceKey, 'Requires disposable local Supabase credentials.');
    // This test may create/delete only its own account on a local test database.
    if (!loopback(apiUrl!) || !baseURL || !loopback(baseURL)) throw new Error('Notes fixture requires loopback app and Supabase URLs.');
    const admin = createClient(apiUrl!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const password = `${randomUUID()}Aa1!`;
    const email = `notes-opening-${randomUUID()}@example.invalid`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const userId = created.data.user!.id;
    const cookies: Array<{ name: string; value: string }> = [];
    const client = createServerClient(apiUrl!, anonKey!, { cookies: {
        getAll: () => cookies,
        setAll: (values: Array<{ name: string; value: string }>) => { for (const cookie of values) {
            const index = cookies.findIndex(value => value.name === cookie.name);
            if (index >= 0) cookies.splice(index, 1);
            cookies.push(cookie);
        } },
    } });
    try {
        expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
        await context.addCookies(cookies.map(cookie => ({ ...cookie, domain: new URL(baseURL).hostname, path: '/', sameSite: 'Lax' as const })));
        let requests = 0;
        await page.route('**/api/chat/notes', async route => {
            requests++;
            const attempt = route.request().postDataJSON().replay.attemptId;
            await new Promise(resolve => setTimeout(resolve, 2000));
            const events = [{ type: 'start', messageId: 'opening-answer' }, { type: 'text-start', id: 'answer' },
                { type: 'text-delta', id: 'answer', delta: 'Synthetic response after context registration.' },
                { type: 'text-end', id: 'answer' }, { type: 'data-notes-attempt', data: attempt },
                { type: 'finish', finishReason: 'stop' }];
            await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream',
                'x-vercel-ai-ui-message-stream': 'v1', 'x-notes-attempt-id': attempt },
                body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n' });
        });
        await page.goto('/notes');
        const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
        await page.getByRole('button', { name: desktop ? 'Ask these notes' : 'Ask', exact: true }).click();
        const composer = page.getByLabel(desktop ? 'Ask a question about the notes in view' : 'Ask a question about these notes', { exact: true });
        await composer.fill('Synthetic opening question');
        await page.getByLabel('Send notes question', { exact: true }).click();
        await expect(page.getByText('Synthetic response after context registration.', { exact: true })).toBeVisible({ timeout: 15000 });
        await expect(composer).toHaveValue('');
        expect(requests).toBe(1);
        if (desktop) {
            const initialContext = new URL(page.url()).searchParams.get('notesContext');
            expect(initialContext).toBeTruthy();
            expect(new URL(page.url()).searchParams.get('ask')).toBe('1');
            await page.getByRole('button', { name: 'Close notes AI', exact: true }).click();
            await expect(composer).toHaveCount(0);
            expect(new URL(page.url()).searchParams.has('ask')).toBe(false);
            await page.getByRole('button', { name: 'Ask these notes', exact: true }).click();
            await expect(page.getByText('Synthetic response after context registration.', { exact: true })).toBeVisible();
            expect(new URL(page.url()).searchParams.get('notesContext')).toBe(initialContext);
        }
    } finally {
        try { await client.auth.signOut({ scope: 'global' }); }
        finally { expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull(); }
    }
});
