import { beforeEach, expect, it } from 'vitest';
import { createNotesChatScope, parseNotesChatScope, serializeNotesChatScope } from '@/lib/notes-chat-scope';
import { clearLegacyNotesChatSessions, clearNotesChatOwner, getNotesChatStorageKey, readNotesChatSession, writeNotesChatSession } from '@/lib/notes-chat-session';

beforeEach(() => window.sessionStorage.clear());
it('canonical scope identity excludes labels and preserves the server filter boundary', () => {
    const a = createNotesChatScope({ version: 1, itemType: 'reflection', filterQuery: '  focus  ' }, 'First label');
    const b = createNotesChatScope({ itemType: 'reflection', version: 1, filterQuery: 'focus' }, 'Second label');
    expect(a.signature).toBe(b.signature);
    expect(parseNotesChatScope(serializeNotesChatScope(a))?.scope).toEqual({ version: 1, itemType: 'reflection', filterQuery: 'focus' });
    expect(createNotesChatScope({ version: 1, itemType: 'all' }).signature).not.toBe(a.signature);
});
it('rejects old ID-only URLs and clears old unowned session caches', () => {
    expect(parseNotesChatScope(JSON.stringify({ highlightIds: ['id'], noteCount: 1, totalMatches: 1, summary: 'Old', signature: 'old' }))).toBeNull();
    window.sessionStorage.setItem('netflux_notes_chat_session:v1:old', 'private transcript');
    clearLegacyNotesChatSessions();
    expect(window.sessionStorage.length).toBe(0);
});
it('cannot restore another account or replacement session even for identical scopes', () => {
    const scope = createNotesChatScope({ version: 1, itemType: 'all' });
    const payload = { activeScope: scope, messages: [{ id: 'a', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Private question' }] }], updatedAt: 1 };
    writeNotesChatSession('account-a:session-1', payload);
    expect(readNotesChatSession('account-a:session-1', scope.signature)?.messages).toEqual(payload.messages);
    expect(readNotesChatSession('account-b:session-1', scope.signature)).toBeNull();
    expect(readNotesChatSession('account-a:session-2', scope.signature)).toBeNull();
    window.sessionStorage.setItem(getNotesChatStorageKey('account-b:session-1', scope.signature), window.sessionStorage.getItem(getNotesChatStorageKey('account-a:session-1', scope.signature))!);
    expect(readNotesChatSession('account-b:session-1', scope.signature)).toBeNull();
    clearNotesChatOwner('account-a:session-1');
    expect(readNotesChatSession('account-a:session-1', scope.signature)).toBeNull();
});
it('does not restore a narrower stored chat under a different filter signature', () => {
    const narrow = createNotesChatScope({ version: 1, itemType: 'note', filterQuery: 'focus' });
    const broad = createNotesChatScope({ version: 1, itemType: 'all' });
    writeNotesChatSession('owner', { activeScope: narrow, messages: [], updatedAt: 1 });
    window.sessionStorage.setItem(getNotesChatStorageKey('owner', broad.signature), window.sessionStorage.getItem(getNotesChatStorageKey('owner', narrow.signature))!);
    expect(readNotesChatSession('owner', broad.signature)).toBeNull();
});
it.each([{ version: 1, itemType: 'all', filterQuery: 'x'.repeat(161) }, { version: 1, itemType: 'all', contentItemId: 'invalid-url-id' }])('keeps invalid scope unavailable rather than broadening it: %j', (invalid) => {
    const scope = createNotesChatScope(invalid);
    expect(scope.scope).toBeNull();
    expect(scope.invalidReason).toContain('Adjust your filters');
    expect(parseNotesChatScope(serializeNotesChatScope(scope))).toBeNull();
});
it('bounds display labels without changing filters and normalizes search before validating its length', () => {
    const scope = createNotesChatScope({ version: 1, itemType: 'note', filterQuery: `focus${' '.repeat(170)}attention` }, 'Long source title '.repeat(40));
    expect(scope.scope?.filterQuery).toBe('focus attention');
    expect(scope.summary.length).toBe(300);
    expect(parseNotesChatScope(serializeNotesChatScope(scope))?.signature).toBe(scope.signature);
});
