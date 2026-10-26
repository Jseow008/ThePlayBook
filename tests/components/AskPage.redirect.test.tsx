import { expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import AskPage from '@/app/(public)/ask/page';
import { createNotesChatScope, serializeNotesChatScope } from '@/lib/notes-chat-scope';

vi.mock('next/navigation', () => ({ redirect: vi.fn((href: string) => { throw new Error(href); }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
it('keeps the active scope and comparison snapshot separate through sign-in redirects', async () => {
    const active = serializeNotesChatScope(createNotesChatScope({ version: 1, itemType: 'all', filterQuery: 'alpha' }));
    const filters = serializeNotesChatScope(createNotesChatScope({ version: 1, itemType: 'note', filterQuery: 'beta' }));
    await expect(AskPage({ searchParams: Promise.resolve({ scope: 'notes', notesScope: active, notesFilters: filters, returnTo: '/notes?q=beta' }) })).rejects.toThrow('/login');
    const login = new URL(vi.mocked(redirect).mock.calls.at(-1)![0], 'https://netflux.blog');
    const next = new URL(login.searchParams.get('next')!, login.origin);
    expect(next.searchParams.get('notesScope')).toBe(active);
    expect(next.searchParams.get('notesFilters')).toBe(filters);
    expect(next.searchParams.get('returnTo')).toBe('/notes?q=beta');
});
