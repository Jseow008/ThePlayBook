import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { newNotesReplayAttemptId } from '@/lib/notes-replay-attempt';
const url=process.env.NOTES_REPLAY_TEST_DATABASE_URL;
if (process.env.NOTES_REPLAY_RUNTIME_REQUIRED==='1'&&!url) throw new Error('Explicit disposable database required');
const database=url?describe:describe.skip;
database('persisted Notes replay ownership and unchanged accounting', () => {
    const db=new Pool({ connectionString:url,max:12,...(url && !['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname) ? {ssl:{rejectUnauthorized:false}} : {}) });
    const userId=randomUUID(),sessionId=randomUUID(),otherUser=randomUUID(),otherSession=randomUUID();
    let policy: Record<string,unknown>;
    const base=()=>({ userId,sessionId,chatId:randomUUID(),questionId:randomUUID(),attemptId:newNotesReplayAttemptId(),keyId:'h1',fingerprints:{ h1:'a'.repeat(64) } });
    async function rpc(action:string,input:Record<string,unknown>,role='service_role') {
        const connection=await db.connect();
        try { await connection.query('BEGIN'); await connection.query(`SET LOCAL ROLE ${role}`);
            const result=await connection.query('SELECT public.notes_replay($1,$2::jsonb) AS result',[action,JSON.stringify(input)]);
            await connection.query('COMMIT'); return result.rows[0].result;
        } catch(error) { await connection.query('ROLLBACK'); throw error; } finally { connection.release(); }
    }
    const counts=async()=>{
        const usage=Number((await db.query('SELECT count(*) n FROM public.ai_message_usage WHERE user_id=$1',[userId])).rows[0].n);
        const spend=Number((await db.query('SELECT count(*) n FROM private.notes_replay_stages WHERE user_id=$1',[userId])).rows[0].n);
        const total=Number((await db.query('SELECT coalesce(sum(charged_microusd),0) n FROM private.ai_spend_daily_totals')).rows[0].n);
        return {usage,spend,total};
    };
    const admit=(owner:Record<string,unknown>)=>rpc('admit',{...owner,dayLimit:10000,weekLimit:10000,monthLimit:10000});
    const reserve=(owner:Record<string,unknown>,stage='embedding')=>rpc('reserve',{...owner,stage,operationId:newNotesReplayAttemptId(),provider:stage==='embedding'?'google':'openai',model:'synthetic',reservedMicrousd:100});
    beforeAll(async()=>{
        // This suite is destructive to the spending switch: refuse any URL that
        // has not been explicitly provided for this disposable verification.
        policy=(await db.query('SELECT * FROM private.ai_spend_policy')).rows[0];
        await db.query('UPDATE private.ai_spend_policy SET enabled=true,daily_limit_microusd=100000000,guest_daily_limit_microusd=1000000');
        await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[userId,otherUser]);
        await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4)',[sessionId,userId,otherSession,otherUser]);
    });
    afterAll(async()=>{
        const operations=await db.query('SELECT operation_id FROM private.notes_replay_stages WHERE user_id IN ($1,$2)',[userId,otherUser]);
        await db.query('DELETE FROM public.ai_message_usage WHERE user_id IN ($1,$2)',[userId,otherUser]);
        await db.query('DELETE FROM auth.users WHERE id IN ($1,$2)',[userId,otherUser]);
        // Keep daily accounting unchanged: a separate fresh database is used for
        // this suite and removed afterward. Never manually refund ledger totals.
        await db.query('UPDATE private.ai_spend_policy SET enabled=$1,daily_limit_microusd=$2,guest_daily_limit_microusd=$3,guest_daily_requests=$4',
            [policy.enabled,policy.daily_limit_microusd,policy.guest_daily_limit_microusd,policy.guest_daily_requests]);
        expect(operations.rowCount).toBeGreaterThan(0); await db.end();
    });
    async function boundedCopies<T>(calls:Promise<T>[]) {
        const settled=await Promise.allSettled(calls);
        for(const result of settled) if(result.status==='rejected')expect(result.reason).toMatchObject({code:'55P03'});
        return {values:settled.flatMap(result=>result.status==='fulfilled'?[result.value]:[]),lockTimeouts:settled.filter(result=>result.status==='rejected').length};
    }
    it('admits one owner/allowance/stage pair for32 concurrent copies and8 repeated RPCs',async()=>{
        const input=base(), before=await counts();
        const claimResult=await boundedCopies(Array.from({length:32},()=>rpc('claim',input)));
        const claims=claimResult.values;
        expect(claims.filter(x=>x.state==='owner')).toHaveLength(1);
        expect(claims.filter(x=>x.state==='running').length+claimResult.lockTimeouts).toBe(31);
        expect(await counts()).toEqual(before);
        const owner={...input,ownerNonce:claims.find(x=>x.state==='owner').ownerNonce};
        const admissions=await boundedCopies(Array.from({length:8},()=>admit(owner)));
        expect(admissions.values.length).toBeGreaterThan(0);expect(admissions.values.every(x=>x.allowed)).toBe(true);
        const stageOutcomes:Record<string,number>={};
        for(const stage of ['embedding','selection']) {
            const reservations=await boundedCopies(Array.from({length:8},()=>reserve(owner,stage)));
            expect(reservations.values.filter(x=>x.dispatch)).toHaveLength(1);stageOutcomes[stage]=reservations.lockTimeouts;
        }
        expect(await counts()).toEqual({usage:before.usage+1,spend:before.spend+2,total:before.total+200});
        expect(await rpc('finish',{...owner,cache:{opaque:'synthetic'},cacheBytes:50})).toEqual({published:true});
        const after=await counts(), completed=await boundedCopies(Array.from({length:8},()=>rpc('claim',input))),copies=completed.values;
        expect(copies.length).toBeGreaterThan(0);expect(copies.every(x=>x.state==='completed'&&x.cache.opaque==='synthetic'&&!x.ownerNonce)).toBe(true);
        expect(await counts()).toEqual(after);
        if(process.env.NOTES_REPLAY_HOSTED_FIXTURE)writeFileSync(process.env.NOTES_REPLAY_HOSTED_FIXTURE+'/hosted-concurrency.json',JSON.stringify({copies:32,owners:1,claimLockTimeouts:claimResult.lockTimeouts,admissionLockTimeouts:admissions.lockTimeouts,stageLockTimeouts:stageOutcomes,completedLockTimeouts:completed.lockTimeouts,before,after}));
    },30000);
    it('rejects changed context/content and browser roles without accounting',async()=>{
        const input=base(); await rpc('claim',input); const before=await counts();
        for(const changed of [{fingerprints:{h1:'b'.repeat(64)}},{chatId:randomUUID()},{questionId:randomUUID()},{retryOf:randomUUID()}]) {
            expect((await rpc('claim',{...input,...changed})).state).toBe('conflict');
        }
        for(const role of ['anon','authenticated']) await expect(rpc('claim',input,role)).rejects.toMatchObject({code:'42501'});
        await expect(rpc('claim',{...base(),sessionId:otherSession})).rejects.toMatchObject({code:'42501'});
        expect(await counts()).toEqual(before);
    });
    it('intentional retry is distinct; late original settles but cannot publish over it',async()=>{
        const input=base(), claim=await rpc('claim',input), original={...input,ownerNonce:claim.ownerNonce};
        await admit(original); await reserve(original);
        const next={...input,attemptId:newNotesReplayAttemptId(),retryOf:input.attemptId};
        const retry={...next,ownerNonce:(await rpc('claim',next)).ownerNonce};
        await admit(retry); await reserve(retry);
        expect((await rpc('claim',{...next,attemptId:newNotesReplayAttemptId(),retryOf:input.attemptId})).state).toBe('conflict');
        expect((await rpc('finish',{...retry,cache:{opaque:'retry'},cacheBytes:30})).published).toBe(true);
        expect((await rpc('finish',{...original,cache:{opaque:'old'},cacheBytes:30})).state).toBe('superseded');
        const before=await counts();
        expect(await rpc('settle',{...original,stage:'embedding',inputTokens:10,outputTokens:0,costMicrousd:20})).toEqual({recorded:true});
        expect(await rpc('settle',{...original,stage:'embedding',inputTokens:10,outputTokens:0,costMicrousd:20})).toEqual({recorded:true});
        expect((await counts()).total).toBe(before.total-80);
        expect((await rpc('claim',next)).cache.opaque).toBe('retry');
    });
    it('repeated failure retains allowance/reserve and nonce/expiry never transfer ownership',async()=>{
        const input=base(), owner={...input,ownerNonce:(await rpc('claim',input)).ownerNonce};
        await admit(owner); await reserve(owner); const before=await counts();
        for(const nonce of [null,randomUUID()]) await expect(rpc('admit',{...owner,ownerNonce:nonce,dayLimit:10000,weekLimit:10000,monthLimit:10000})).rejects.toMatchObject({code:'42501'});
        await rpc('fail',{...owner,code:'RETRIEVAL_UNAVAILABLE',status:503});
        for(let i=0;i<8;i++)expect(await rpc('claim',input)).toMatchObject({state:'failed',status:503,code:'RETRIEVAL_UNAVAILABLE'});
        expect(await counts()).toEqual(before);
        const expired=base(), expiredOwner={...expired,ownerNonce:(await rpc('claim',expired)).ownerNonce};
        await db.query('UPDATE private.notes_replay_attempts SET work_until=clock_timestamp()-interval \'1 second\' WHERE attempt_id=$1',[expired.attemptId]);
        expect((await rpc('claim',expired)).state).toBe('uncertain');
        expect((await rpc('finish',{...expiredOwner,cache:null,cacheBytes:0})).state).toBe('superseded');
    },30000);
    it('disabled spending stays503-compatible and admission is not refunded',async()=>{
        const input=base(), owner={...input,ownerNonce:(await rpc('claim',input)).ownerNonce};
        const before=await counts(); await admit(owner);
        await db.query('UPDATE private.ai_spend_policy SET enabled=false');
        try { expect(await reserve(owner)).toMatchObject({allowed:false,reason:'disabled',dispatch:false}); }
        finally { await db.query('UPDATE private.ai_spend_policy SET enabled=true'); }
        expect(await counts()).toEqual({...before,usage:before.usage+1});
    });
    it('expired result keeps a tombstone; pruning cannot revive the same old UUID',async()=>{
        const input=base(), owner={...input,ownerNonce:(await rpc('claim',input)).ownerNonce};
        await admit(owner); await rpc('finish',{...owner,cache:{opaque:'old'},cacheBytes:20});
        await db.query('UPDATE private.notes_replay_attempts SET cache_until=clock_timestamp()-interval \'1 second\' WHERE attempt_id=$1',[input.attemptId]);
        expect(await rpc('claim',input)).toMatchObject({state:'completed',cache:null});
        const oldId=newNotesReplayAttemptId(Date.now()-36*86400000), old={...base(),attemptId:oldId};
        await db.query('INSERT INTO private.notes_replay_questions(user_id,session_id,chat_id,question_id,active_attempt) VALUES($1,$2,$3,$4,$5)',[userId,sessionId,old.chatId,old.questionId,oldId]);
        await db.query('INSERT INTO private.notes_replay_attempts(user_id,session_id,chat_id,question_id,attempt_id,key_id,fingerprint,created_at) VALUES($1,$2,$3,$4,$5,\'h1\',$6,clock_timestamp()-interval \'36 days\')',[userId,sessionId,old.chatId,old.questionId,oldId,'a'.repeat(64)]);
        const before=await counts(); await db.query('SELECT private.notes_replay_prune()');
        expect((await db.query('SELECT 1 FROM private.notes_replay_attempts WHERE attempt_id=$1',[oldId])).rowCount).toBe(0);
        expect((await rpc('claim',old)).state).toBe('expired');
        expect(await counts()).toEqual(before);
        expect((await rpc('claim',{...old,attemptId:newNotesReplayAttemptId(),retryOf:oldId})).state).toBe('owner');
    });
    it('caps encrypted cache bytes without deleting identity records or changing accounting',async()=>{
        const before=await counts(),ids:string[]=[];
        for(let index=0;index<17;index++){
            const input=base();ids.push(input.attemptId);const owner={...input,ownerNonce:(await rpc('claim',input)).ownerNonce};
            expect(await rpc('finish',{...owner,cache:{opaque:'0'.repeat(520000)},cacheBytes:260000})).toEqual({published:true});
        }
        const stored=await db.query('SELECT count(*) n,coalesce(sum(cache_bytes),0) bytes FROM private.notes_replay_attempts WHERE user_id=$1',[userId]);
        expect(Number(stored.rows[0].bytes)).toBeLessThanOrEqual(8388608);
        expect(Number((await db.query('SELECT count(*) n FROM private.notes_replay_attempts WHERE attempt_id=ANY($1::uuid[])',[ids])).rows[0].n)).toBe(17);
        expect(await counts()).toEqual(before);
    },30000);
    it('rolls allowance and replay state back together; contention never grants ownership',async()=>{
        const input=base(),owner={...input,ownerNonce:(await rpc('claim',input)).ownerNonce},before=await counts();
        const connection=await db.connect();
        try{
            await connection.query('BEGIN');await connection.query('SET LOCAL ROLE service_role');
            await connection.query("SELECT public.notes_replay('admit',$1::jsonb)",[JSON.stringify({...owner,dayLimit:10000,weekLimit:10000,monthLimit:10000})]);
            await connection.query('ROLLBACK');expect(await counts()).toEqual(before);
            await connection.query('BEGIN');await connection.query('SELECT 1 FROM private.notes_replay_questions WHERE user_id=$1 AND session_id=$2 AND chat_id=$3 AND question_id=$4 FOR UPDATE',[userId,sessionId,input.chatId,input.questionId]);
            const start=Date.now();await expect(rpc('claim',input)).rejects.toMatchObject({code:'55P03'});
            expect(Date.now()-start).toBeLessThan(2500);
        }finally{await connection.query('ROLLBACK');connection.release();}
        expect(await counts()).toEqual(before);expect((await admit(owner)).allowed).toBe(true);
        expect((await counts()).usage).toBe(before.usage+1);
    },10000);
    it('rejects stale/future/legacy IDs and revoked sessions; late accounting still settles',async()=>{
        const before=await counts();
        for(const id of [newNotesReplayAttemptId(Date.now()-301000),newNotesReplayAttemptId(Date.now()+61000),randomUUID()]) expect((await rpc('claim',{...base(),attemptId:id})).state).toBe('expired');
        expect(await counts()).toEqual(before);
        const temporary=randomUUID(); await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[temporary,userId]);
        const input={...base(),sessionId:temporary}, owner={...input,ownerNonce:(await rpc('claim',input)).ownerNonce};
        await admit(owner); await reserve(owner);
        await db.query('DELETE FROM auth.sessions WHERE id=$1',[temporary]);
        await expect(rpc('claim',input)).rejects.toMatchObject({code:'42501'});
        expect(await rpc('settle',{...owner,stage:'embedding',inputTokens:1,outputTokens:0,costMicrousd:1})).toEqual({recorded:true});
    });
});
