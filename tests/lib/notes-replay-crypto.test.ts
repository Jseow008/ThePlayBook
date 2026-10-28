import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { canonicalReplayValue, decryptReplay, encryptReplay, replayFingerprint } from '@/lib/server/notes-replay-crypto';
import { newNotesReplayAttemptId } from '@/lib/notes-replay-attempt';
const namespace = { userId:'a',sessionId:'s',chatId:'c',questionId:'q',attemptId:'r' };
let first: string, second: string, fingerprint: string;
beforeEach(() => {
    first=randomBytes(32).toString('hex'); second=randomBytes(32).toString('hex');
    vi.stubEnv('NOTES_REPLAY_KEYS',JSON.stringify({ encryptionCurrent:'v1',fingerprintCurrent:'h1',encryption:{ v1:first },fingerprint:{ h1:second } }));
    fingerprint=replayFingerprint(second,'request',{ text:'Synthetic question\nSecond line',scope:{ version:1,itemType:'all' } });
});
afterEach(() => vi.unstubAllEnvs());
describe('private bounded replay envelopes', () => {
    it('canonicalizes object keys but preserves array order and exact accepted strings', () => {
        expect(canonicalReplayValue({ b:1,a:2 })).toBe(canonicalReplayValue({ a:2,b:1 }));
        expect(replayFingerprint(second,'request',['a','b'])).not.toBe(replayFingerprint(second,'request',['b','a']));
        expect(replayFingerprint(second,'request','text\n')).not.toBe(replayFingerprint(second,'request','text'));
        expect(replayFingerprint(second,'evidence','text')).not.toBe(replayFingerprint(second,'request','text'));
    });
    it('round-trips exact multiline text and uses fresh nonces without plaintext storage', () => {
        const text='Synthetic answer 🌱\n\n  preserve spaces';
        const one=encryptReplay(text,namespace,fingerprint), two=encryptReplay(text,namespace,fingerprint);
        expect(one.data).not.toContain('Synthetic'); expect(one.nonce).not.toBe(two.nonce);
        expect(decryptReplay(one,namespace,{ h1:fingerprint })).toBe(text);
    });
    it.each(['userId','sessionId','chatId','questionId','attemptId'])('rejects swapped %s context', field => {
        const envelope=encryptReplay('synthetic',namespace,fingerprint);
        expect(() => decryptReplay(envelope,{ ...namespace,[field]:'other' },{ h1:fingerprint })).toThrow();
    });
    it('rejects tampered ciphertext, tag and fingerprint', () => {
        const envelope=encryptReplay('synthetic',namespace,fingerprint);
        for (const field of ['data','tag'] as const) {
            const corrupted={ ...envelope,[field]:(envelope[field][0]==='0'?'1':'0')+envelope[field].slice(1) };
            expect(() => decryptReplay(corrupted,namespace,{ h1:fingerprint })).toThrow();
        }
        expect(() => decryptReplay(envelope,namespace,{ h1:'0'.repeat(64) })).toThrow();
    });
    it('reads retained old keys after rotation and fails closed after key removal', () => {
        const envelope=encryptReplay('synthetic',namespace,fingerprint);
        vi.stubEnv('NOTES_REPLAY_KEYS',JSON.stringify({ encryptionCurrent:'v2',fingerprintCurrent:'h2',
            encryption:{ v1:first,v2:randomBytes(32).toString('hex') },fingerprint:{ h1:second,h2:randomBytes(32).toString('hex') } }));
        expect(decryptReplay(envelope,namespace,{ h1:fingerprint })).toBe('synthetic');
        vi.stubEnv('NOTES_REPLAY_KEYS',JSON.stringify({ encryptionCurrent:'v2',fingerprintCurrent:'h2',
            encryption:{ v2:randomBytes(32).toString('hex') },fingerprint:{ h2:randomBytes(32).toString('hex') } }));
        expect(() => decryptReplay(envelope,namespace,{ h1:fingerprint })).toThrow();
    });
    it('embeds the immutable millisecond time in a valid fresh UUIDv7', () => {
        const timestamp=Date.parse('2026-10-28T00:00:00Z'), id=newNotesReplayAttemptId(timestamp);
        expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
        expect(parseInt(id.replaceAll('-','').slice(0,12),16)).toBe(timestamp);
        expect(newNotesReplayAttemptId(timestamp)).not.toBe(id);
    });
});
