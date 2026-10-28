import { describe, expect, it, vi } from 'vitest';
import { NotesReplayResponseGuard } from '@/lib/notes-replay-guard';
describe('response identity fence', () => {
    it('keeps late original output from replacing an intentional retry', async () => {
        let resolve!: (response:Response)=>void;
        const send=vi.fn<typeof fetch>().mockImplementationOnce(()=>new Promise(done=>{resolve=done;}))
            .mockResolvedValueOnce(new Response('Retry answer',{headers:{'x-notes-attempt-id':'new'}}));
        const guard=new NotesReplayResponseGuard(()=>true,send);
        guard.activate('old'); const original=guard.fetch('/api/chat/notes',{body:JSON.stringify({replay:{attemptId:'old'}})});
        const checked=expect(original).rejects.toThrow('no longer active');
        guard.activate('new');
        expect(await (await guard.fetch('/api/chat/notes',{body:JSON.stringify({replay:{attemptId:'new'}})})).text()).toBe('Retry answer');
        resolve(new Response('Old answer',{headers:{'x-notes-attempt-id':'old'}})); await checked;
        expect(send).toHaveBeenCalledTimes(2);
    });
    it('rejects another account, an unmounted chat and mismatched successful response IDs',async()=>{
        let live=true;
        const send=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('synthetic',{headers:{'x-notes-attempt-id':'a'}}));
        const guard=new NotesReplayResponseGuard(()=>live,send);guard.activate('a');
        live=false;await expect(guard.fetch('/',{body:JSON.stringify({replay:{attemptId:'a'}})})).rejects.toThrow();
        live=true;guard.retire();await expect(guard.fetch('/',{body:JSON.stringify({replay:{attemptId:'a'}})})).rejects.toThrow();
        guard.resume();guard.activate('b');await expect(guard.fetch('/',{body:JSON.stringify({replay:{attemptId:'b'}})})).rejects.toThrow();
    });
});
it('offers server-clock recovery only for a later explicit attempt, without another fetch',async()=>{
    const serverTime=Date.parse('2026-10-28T00:00:00Z');
    const send=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{code:'ASK_ATTEMPT_EXPIRED',serverTime}},{status:410}));
    const guard=new NotesReplayResponseGuard(()=>true,send);guard.activate('old');
    await guard.fetch('/',{body:JSON.stringify({replay:{attemptId:'old'}})});
    expect(send).toHaveBeenCalledTimes(1);
    const fresh=guard.newAttemptId();
    expect(Math.abs(parseInt(fresh.replaceAll('-','').slice(0,12),16)-serverTime)).toBeLessThan(100);
    expect(send).toHaveBeenCalledTimes(1);
});
it('uses a verified missing-parent hint only for the next explicit retry of that attempt',async()=>{
    const parent='12345678-1234-7123-8123-123456789abc';
    const send=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{code:'ASK_ATTEMPT_RETRY_PARENT_CHANGED',retryOf:parent}},{status:409}));
    const guard=new NotesReplayResponseGuard(()=>true,send);guard.activate('missing-child');
    await guard.fetch('/',{body:JSON.stringify({replay:{attemptId:'missing-child'}})});
    expect(send).toHaveBeenCalledOnce();
    guard.activate('new-explicit-attempt');
    expect(guard.retryParent('missing-child')).toBe(parent);
    expect(guard.retryParent('different-question')).toBe('different-question');
    expect(send).toHaveBeenCalledOnce();
});
