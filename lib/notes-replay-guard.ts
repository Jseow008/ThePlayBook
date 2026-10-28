import { newNotesReplayAttemptId } from './notes-replay-attempt';
/** Per-mounted-chat response fence. This is not React render state. */
export class NotesReplayResponseGuard {
    private activeAttempt: string | undefined;
    private mounted = true;
    private clockOffset = 0;
    newAttemptId() { return newNotesReplayAttemptId(Date.now()+this.clockOffset); }
    constructor(private readonly live: () => boolean, private readonly send: typeof fetch = (...args) => fetch(...args)) {}
    activate(attemptId: string) { this.activeAttempt=attemptId; }
    resume() { this.mounted=true; }
    retire() { this.mounted=false; this.activeAttempt=undefined; }
    readonly fetch: typeof fetch = async (url,init) => {
        const attemptId: unknown=JSON.parse(String(init?.body ?? '{}')).replay?.attemptId;
        if (!this.mounted || !this.live() || typeof attemptId !== 'string' || this.activeAttempt!==attemptId) throw new Error('This attempt is no longer active.');
        const response=await this.send(url,init);
        if (!this.mounted || !this.live() || typeof attemptId !== 'string' || this.activeAttempt!==attemptId
            || (response.ok && response.headers.get('x-notes-attempt-id')!==attemptId)) throw new Error('This attempt is no longer active.');
        if (!response.ok) {
            const payload = await response.clone().json().catch(() => null);
            const serverTime: unknown = payload?.error?.serverTime;
            if (payload?.error?.code === 'ASK_ATTEMPT_EXPIRED' && typeof serverTime === 'number'
                && Number.isSafeInteger(serverTime) && serverTime > 0 && serverTime < 2 ** 48) this.clockOffset=serverTime-Date.now();
        }
        // Recovery changes only the next explicit action; never dispatch here.
        return response;
    };
}
