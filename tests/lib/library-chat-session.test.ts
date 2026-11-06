import { beforeEach, expect, it } from 'vitest';
import { clearLibraryChatSessions, newLibraryChatSession, readLibraryChatSession, writeLibraryChatSession } from '@/lib/library-chat-session';
beforeEach(() => { clearLibraryChatSessions(); window.sessionStorage.clear(); });
it('rejects copied cross-owner recovery payloads and malformed message parts', () => {
    const owner = JSON.stringify(['account-a', 'session-one']);
    writeLibraryChatSession(owner, { ...newLibraryChatSession(), draft: 'Private text' });
    const key = `netflux_library_chat:v1:${encodeURIComponent(owner)}`;
    const raw = window.sessionStorage.getItem(key)!;
    window.sessionStorage.setItem('netflux_library_chat:v1:other-owner', raw);
    expect(readLibraryChatSession('other-owner')).toBeNull();
    window.sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(raw), messages: [{ id: 'broken', role: 'assistant', parts: ['not a message part'] }] }));
    expect(readLibraryChatSession(owner)).toBeNull();
});
it('does not attach a failed-turn status to another question or a completed answer', () => {
    const owner = 'owner';
    const base = { ...newLibraryChatSession(), failure: { questionId: 'question-one', message: 'Failure' },
        messages: [{ id: 'question-two', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Another question' }] }] };
    writeLibraryChatSession(owner, base); expect(readLibraryChatSession(owner)?.failure).toBeNull();
    writeLibraryChatSession(owner, { ...base, messages: [...base.messages, { id: 'answer', role: 'assistant', parts: [{ type: 'text', text: 'Complete answer' }] }] });
    expect(readLibraryChatSession(owner)?.failure).toBeNull();
});
