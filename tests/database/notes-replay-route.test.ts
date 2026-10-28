import { readFileSync,writeFileSync } from 'node:fs';
import { randomBytes,randomUUID } from 'node:crypto';
import { createServer,type ServerResponse } from 'node:http';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { newNotesReplayAttemptId } from '@/lib/notes-replay-attempt';
const { getClient,embed,generate }=vi.hoisted(()=>({getClient:vi.fn(),embed:vi.fn(),generate:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:getClient}));
vi.mock('@/lib/server/ai-rate-limit',()=>({aiRateLimit:async()=>({success:true}),aiNetworkIdentifier:()=>null}));
vi.mock('@/lib/server/analytics',()=>({captureServerAnalyticsEvent:vi.fn()}));
vi.mock('@/lib/server/after-response',()=>({afterResponse:()=>{}}));
vi.mock('@/lib/server/security-telemetry',()=>({recordAiRouteAbuse:vi.fn()}));
vi.mock('ai',async original=>({...await original<typeof import('ai')>(),generateText:generate}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{models={embedContent:embed};}}));
import { POST } from '@/app/api/chat/notes/route';
import { withNotesReplayRequest } from '@/lib/server/notes-replay';
const fixtureRoot=process.env.NOTES_REPLAY_HOSTED_FIXTURE;
if(process.env.NOTES_REPLAY_HOSTED_REQUIRED==='1'&&!fixtureRoot)throw new Error('Disposable hosted fixture required');
const hosted=fixtureRoot?describe:describe.skip;
hosted('actual Notes route with hosted Auth/RLS/ledger and controlled providers',()=>{
    let fixture:{userId:string;otherUserId:string;email:string;otherEmail:string;password:string;highlightId:string;contentId:string;quote:string;thought:string};
    let config:{dbUrl:string;production:string;project:{id:string};keys:{name:string;api_key:string}[]};
    let db:Pool,client:ReturnType<typeof createClient>,otherClient:ReturnType<typeof createClient>;
    let pauseRead: (()=>Promise<void>)|undefined;
    let sessionId: string;
    let selectorDelay=0,onSelection:(()=>void)|undefined;
    const vector=[1,...Array(767).fill(0)];
    function request(replay:{chatId:string;questionId:string;attemptId:string;retryOf?:string}={chatId:randomUUID(),questionId:randomUUID(),attemptId:newNotesReplayAttemptId()},scope={version:1,itemType:'all'}) {
        return {replay:{...replay,expectedOwner:JSON.stringify([fixture.userId,sessionId])},scope,messages:[{id:replay.questionId,role:'user',parts:[{type:'text',text:'Which saved passage discusses preserving a question?'}]}]};
    }
    const post=(body:ReturnType<typeof request>,signal?:AbortSignal)=>POST(new NextRequest('http://127.0.0.1:3089/api/chat/notes',{method:'POST',headers:{'content-type':'application/json','x-evidence-protocol':'ui'},body:JSON.stringify(body),signal}));
    async function accounting(){
        const usage=Number((await db.query('SELECT count(*) n FROM public.ai_message_usage WHERE user_id=$1',[fixture.userId])).rows[0].n);
        const stages=(await db.query('SELECT stage,operation_id FROM private.notes_replay_stages WHERE user_id=$1 ORDER BY operation_id',[fixture.userId])).rows;
        const ledger=(await db.query('SELECT operation_id,cost_microusd,reserved_microusd FROM private.ai_spend_operations WHERE operation_id=ANY($1::uuid[])',[stages.map(x=>x.operation_id)])).rows;
        return {usage,stageCount:stages.length,ledgerCount:ledger.length,total:ledger.reduce((sum,row)=>sum+Number(row.cost_microusd??row.reserved_microusd),0)};
    }
    beforeAll(async()=>{
        fixture=JSON.parse(readFileSync(fixtureRoot+'/fixtures-private.json','utf8'));
        config=JSON.parse(readFileSync(fixtureRoot+'/hosted-private.json','utf8'));
        if(config.project.id===config.production)throw new Error('Production forbidden');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://'+config.project.id+'.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_KEY',config.keys.find(x=>x.name==='service_role')!.api_key);
        vi.stubEnv('ANTHROPIC_API_KEY','controlled-no-network');vi.stubEnv('GEMINI_API_KEY','controlled-no-network');
        vi.stubEnv('AI_DAILY_MESSAGE_LIMIT','10000');vi.stubEnv('AI_WEEKLY_MESSAGE_LIMIT','10000');vi.stubEnv('AI_MONTHLY_MESSAGE_LIMIT','10000');
        vi.stubEnv('AI_PROVIDER','anthropic');vi.stubEnv('AI_MODEL','claude-haiku-4-5-20251001');vi.stubEnv('PERSONAL_EVIDENCE_SELECTOR_MODEL','');
        vi.stubEnv('ACCOUNT_DATA_CURSOR_SECRET',randomBytes(32).toString('hex'));
        vi.stubEnv('NOTES_REPLAY_KEYS',JSON.stringify({encryptionCurrent:'e1',fingerprintCurrent:'h1',encryption:{e1:randomBytes(32).toString('hex')},fingerprint:{h1:randomBytes(32).toString('hex')}}));
        db=new Pool({connectionString:config.dbUrl,ssl:{rejectUnauthorized:false},max:8});
        await db.query('UPDATE private.ai_spend_policy SET enabled=true,daily_limit_microusd=1000000000,guest_daily_limit_microusd=1000000');
        const anon=config.keys.find(x=>x.name==='anon')!.api_key;
        client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(...args)=>{if(pauseRead&&String(args[0]).includes('/rest/v1/user_highlights'))await pauseRead();return fetch(...args);}}});
        otherClient=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,anon,{auth:{persistSession:false,autoRefreshToken:false}});
        for(const [instance,email]of[[client,fixture.email],[otherClient,fixture.otherEmail]] as const){const {error}=await instance.auth.signInWithPassword({email,password:fixture.password});if(error)throw new Error('Synthetic sign-in failed');}
        sessionId=String((await client.auth.getClaims()).data!.claims.session_id);
        getClient.mockResolvedValue(client);
        embed.mockImplementation(async()=>({embeddings:[{values:vector}]}));
        generate.mockImplementation(async()=>{
            onSelection?.(); if(selectorDelay)await new Promise(done=>setTimeout(done,selectorDelay));
            return {output:{requestedFacets:['preserving a question'],assessments:[{id:'highlight:'+fixture.highlightId,requestedFacet:'preserving a question',supportSummary:'The synthetic passage states this.',constraintCheck:'The synthetic record matches.',verdict:'direct'}]},
                usage:{inputTokens:10,outputTokens:5},response:{modelId:'claude-haiku-4-5-20251001'}};
        });
    },30000);
    afterAll(async()=>{await db?.query('UPDATE private.ai_spend_policy SET enabled=false');await db?.end();vi.unstubAllEnvs();});
    it('repeated server receipts produce one actual admission/embedding/selection pair and identical replay',async()=>{
        const body=request(),before=await accounting(),embedded=embed.mock.calls.length,selected=generate.mock.calls.length;
        selectorDelay=250;
        const copies=await Promise.all([post(body),post(body)]);selectorDelay=0;
        // Concurrent receipts can finish authentication in either order. The
        // processing owner is the successful response, not an array position.
        const ownerIndex=copies.findIndex(response=>response.status===200);
        expect(ownerIndex).toBeGreaterThanOrEqual(0);
        const original=copies[ownerIndex],duplicate=copies[1-ownerIndex];
        expect(original.status).toBe(200);expect([200,409]).toContain(duplicate.status);
        const text=await original.text();expect(text).toContain(fixture.quote);
        if(duplicate.status===200)expect(await duplicate.text()).toBe(text);
        else expect((await duplicate.json()).error.code).toBe('ASK_ATTEMPT_IN_PROGRESS');
        const replay=await post(body);expect(replay.status).toBe(200);expect(await replay.text()).toBe(text);
        expect(original.headers.get('x-notes-attempt-id')).toBe(body.replay.attemptId);
        expect(embed.mock.calls.length-embedded).toBe(1);expect(generate.mock.calls.length-selected).toBe(1);
        expect(await accounting()).toEqual({usage:before.usage+1,stageCount:before.stageCount+2,ledgerCount:before.ledgerCount+2,total:before.total+343});
        writeFileSync(fixtureRoot+'/route-integration-accounting.json',JSON.stringify({before,after:await accounting(),processingReceipts:2,applicationDispatches:'not measured by this test; see native Chrome reset probe',embeddingCalls:1,selectionCalls:1}));
    },30000);
    it('changed scope/content, another account and changed/deleted evidence cannot replay private output',async()=>{
        const body=request(),original=await post(body);expect(original.status).toBe(200);await original.text();
        const before=await accounting();
        const changed=await post({...body,scope:{version:1,itemType:'all',filterQuery:'different'} } as ReturnType<typeof request>);
        expect(changed.status).toBe(409);expect(await changed.text()).not.toContain(fixture.quote);
        getClient.mockResolvedValueOnce(otherClient);
        const other=await post(body);expect(other.status).toBe(401);expect(await other.text()).not.toContain(fixture.quote);
        await db.query('UPDATE public.user_highlights SET note_body=$2 WHERE id=$1',[fixture.highlightId,'Synthetic revised thought']);
        const stale=await post(body);expect(stale.status).toBe(410);expect(await stale.text()).not.toContain(fixture.quote);
        await db.query('UPDATE public.user_highlights SET note_body=$2 WHERE id=$1',[fixture.highlightId,fixture.thought]);
        // Revision invalidation is intentional: reseed the controlled vector after this change.
        await db.query("UPDATE private.personal_evidence_index SET state='ready',lease_token=NULL,lease_expires_at=NULL WHERE user_id=$1",[fixture.userId]);
        await db.query("INSERT INTO private.personal_evidence_chunk(evidence_type,evidence_id,revision,field,chunk_index,start_offset,end_offset,embedding) SELECT evidence_type,evidence_id,revision,'highlightedText',0,0,$2,$3::extensions.vector FROM private.personal_evidence_index WHERE evidence_id=$1 ON CONFLICT DO NOTHING",[fixture.highlightId,fixture.quote.length,JSON.stringify(vector)]);
        // Another account's separate valid attempt may consume its own allowance, never this account's.
        expect(await accounting()).toEqual(before);
    },30000);
    it('explicit retry fences a late original while both retain their own accounting',async()=>{
        const body=request(),before=await accounting(),controller=new AbortController();
        selectorDelay=500;
        let began!:()=>void;const started=new Promise<void>(resolve=>{began=resolve;});onSelection=began;
        const original=post(body,controller.signal);await started;controller.abort();
        const stopped=await original;expect(stopped.status).toBe(499);await stopped.text();
        onSelection=undefined;selectorDelay=0;
        const retried={...body,replay:{...body.replay,attemptId:newNotesReplayAttemptId(),retryOf:body.replay.attemptId}};
        const retry=await post(retried);expect(retry.status).toBe(200);const answer=await retry.text();
        await new Promise(done=>setTimeout(done,650));
        const old=await post(body);expect(old.status).toBe(409);expect(await old.text()).not.toContain(fixture.quote);
        const same=await post(retried);expect(same.status).toBe(200);expect(await same.text()).toBe(answer);
        expect(await accounting()).toEqual({usage:before.usage+2,stageCount:before.stageCount+4,ledgerCount:before.ledgerCount+4,total:before.total+686});
    },30000);
    it('missing intermediate retries offer an authenticated hint without automatic processing',async()=>{
        const body=request(),initial=await post(body);expect(initial.status).toBe(200);await initial.text();
        const before=await accounting(),missing=newNotesReplayAttemptId();
        const lostParent={...body,replay:{...body.replay,attemptId:newNotesReplayAttemptId(),retryOf:missing}};
        const recovery=await post(lostParent);expect(recovery.status).toBe(409);
        const hint=(await recovery.json()).error;
        expect(hint.code).toBe('ASK_ATTEMPT_RETRY_PARENT_CHANGED');expect(hint.retryOf).toBe(body.replay.attemptId);
        expect(await accounting()).toEqual(before);
        const explicit={...body,replay:{...body.replay,attemptId:newNotesReplayAttemptId(),retryOf:hint.retryOf}};
        const answer=await post(explicit);expect(answer.status).toBe(200);expect(await answer.text()).toContain(fixture.quote);
        const after=await accounting();
        expect(after).toEqual({usage:before.usage+1,stageCount:before.stageCount+2,ledgerCount:before.ledgerCount+2,total:before.total+343});
        const delayed=await post({...body,replay:{...body.replay,attemptId:missing,retryOf:body.replay.attemptId}});
        expect(delayed.status).toBe(409);expect((await delayed.json()).error.code).toBe('ASK_ATTEMPT_CONFLICT');
        expect(await accounting()).toEqual(after);
    },30000);
    it('blocks evidence deletion while a cached read is pending',async()=>{
        const body=request(),answer=await post(body);expect(answer.status).toBe(200);await answer.text();
        const before=await accounting();let begin!:()=>void,release!:()=>void;
        const pending=new Promise<void>(done=>{begin=done;}),gate=new Promise<void>(done=>{release=done;});
        pauseRead=async()=>{begin();await gate;pauseRead=undefined;};
        const replay=post(body);await pending;
        await db.query('DELETE FROM public.user_highlights WHERE id=$1',[fixture.highlightId]);release();
        try{const result=await replay;expect(result.status).toBe(410);expect(await result.text()).not.toContain(fixture.quote);}
        finally{
            pauseRead=undefined;
            await db.query('INSERT INTO public.user_highlights(id,user_id,content_item_id,highlighted_text,note_body) VALUES($1,$2,$3,$4,$5)',[fixture.highlightId,fixture.userId,fixture.contentId,fixture.quote,fixture.thought]);
            await db.query("UPDATE private.personal_evidence_index SET state='ready',lease_token=NULL,lease_expires_at=NULL WHERE user_id=$1",[fixture.userId]);
            await db.query("INSERT INTO private.personal_evidence_chunk(evidence_type,evidence_id,revision,field,chunk_index,start_offset,end_offset,embedding) SELECT evidence_type,evidence_id,revision,'highlightedText',0,0,$2,$3::extensions.vector FROM private.personal_evidence_index WHERE evidence_id=$1",[fixture.highlightId,fixture.quote.length,JSON.stringify(vector)]);
        }
        expect(await accounting()).toEqual(before);
    },30000);
    it('rejects a session revoked during cached evidence validation',async()=>{
        const body=request(),answer=await post(body);expect(answer.status).toBe(200);await answer.text();
        const before=await accounting();const claims=await client.auth.getClaims();const session=claims.data!.claims.session_id;
        let begin!:()=>void,release!:()=>void;const pending=new Promise<void>(done=>{begin=done;}),gate=new Promise<void>(done=>{release=done;});
        pauseRead=async()=>{begin();await gate;pauseRead=undefined;};const replay=post(body);await pending;
        await db.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[session,fixture.userId]);release();
        try{const result=await replay;expect([401,410]).toContain(result.status);expect(await result.text()).not.toContain(fixture.quote);}
        finally{pauseRead=undefined;const signed=await client.auth.signInWithPassword({email:fixture.email,password:fixture.password});expect(signed.error).toBeNull();sessionId=String((await client.auth.getClaims()).data!.claims.session_id);}
        expect(await accounting()).toEqual(before);
    },30000);
    it('key rotation reuses authorized results; missing keys, tamper and cache expiry never process again',async()=>{
        const body=request(),answer=await post(body);expect(answer.status).toBe(200);const original=await answer.text(),before=await accounting();
        const saved=process.env.NOTES_REPLAY_KEYS!,keys=JSON.parse(saved);
        try{
            vi.stubEnv('NOTES_REPLAY_KEYS',JSON.stringify({...keys,encryptionCurrent:'e2',fingerprintCurrent:'h2',encryption:{...keys.encryption,e2:randomBytes(32).toString('hex')},fingerprint:{...keys.fingerprint,h2:randomBytes(32).toString('hex')}}));
            const retained=await post(body);expect(retained.status).toBe(200);expect(await retained.text()).toBe(original);
            vi.stubEnv('NOTES_REPLAY_KEYS',JSON.stringify({...keys,encryptionCurrent:'e2',encryption:{e2:randomBytes(32).toString('hex')}}));
            expect((await post(body)).status).toBe(410);
        }finally{vi.stubEnv('NOTES_REPLAY_KEYS',saved);}
        await db.query("UPDATE private.notes_replay_attempts SET cache=jsonb_set(cache,'{tag}',to_jsonb(repeat('0',32))) WHERE user_id=$1 AND attempt_id=$2",[fixture.userId,body.replay.attemptId]);
        expect((await post(body)).status).toBe(410);
        await db.query("UPDATE private.notes_replay_attempts SET cache_until=clock_timestamp()-interval '1 second' WHERE user_id=$1 AND attempt_id=$2",[fixture.userId,body.replay.attemptId]);
        expect((await post(body)).status).toBe(410);expect(await accounting()).toEqual(before);
    },30000);
    it('rejects restored expired ciphertext after cleanup without any new processing',async()=>{
        const body=request(),answer=await post(body);expect(answer.status).toBe(200);await answer.text();
        const before=await accounting(),snapshot=(await db.query('SELECT cache,cache_bytes FROM private.notes_replay_attempts WHERE user_id=$1 AND attempt_id=$2',[fixture.userId,body.replay.attemptId])).rows[0];
        await db.query("UPDATE private.notes_replay_attempts SET cache_until=clock_timestamp()-interval '1 hour' WHERE user_id=$1 AND attempt_id=$2",[fixture.userId,body.replay.attemptId]);
        await db.query('SELECT private.notes_replay_prune()');
        expect((await db.query('SELECT cache FROM private.notes_replay_attempts WHERE user_id=$1 AND attempt_id=$2',[fixture.userId,body.replay.attemptId])).rows[0].cache).toBeNull();
        // Model restoring old private cache material; no managed backup or Auth
        // restore is claimed. Logical expiry must survive physical restoration.
        await db.query("UPDATE private.notes_replay_attempts SET cache=$3,cache_bytes=$4,cache_until=clock_timestamp()-interval '1 hour' WHERE user_id=$1 AND attempt_id=$2",[fixture.userId,body.replay.attemptId,snapshot.cache,snapshot.cache_bytes]);
        const restored=await post(body);expect(restored.status).toBe(410);expect(await restored.text()).not.toContain(fixture.quote);
        expect(await accounting()).toEqual(before);
    },30000);
    it('delivers an oversized fresh response but leaves a nonreplayable identity tombstone',async()=>{
        const body=request(),before=await accounting();
        const run=vi.fn(async()=>new Response('x'.repeat(262145),{headers:{'content-type':'text/plain'}}));
        const options={client:await getClient(),userId:fixture.userId,replay:body.replay,submittedQuestionId:body.replay.questionId,
            request:{synthetic:'oversize'},scope:{version:1 as const,itemType:'all' as const},signal:new AbortController().signal};
        const first=await withNotesReplayRequest(options,run);expect(first.status).toBe(200);expect((await first.text()).length).toBe(262145);
        const duplicate=await withNotesReplayRequest(options,run);expect(duplicate.status).toBe(410);expect(run).toHaveBeenCalledOnce();
        expect(await accounting()).toEqual(before);
    },30000);
    it.skipIf(!process.env.NOTES_REPLAY_BROWSER_PROBE)('native Chrome connection-reset reproduction; one JS fetch may have repeated receipts',async()=>{
        const receipts:{receiptId:string;dispatchId:string;attemptId:string;socketPort:number|undefined}[]=[];
        const responses:{receiptId:string;status:number;code?:string}[]=[];
        const before=await accounting(),initialEmbed=embed.mock.calls.length,initialSelect=generate.mock.calls.length;
        const body=request();let first:ServerResponse|undefined,reset=false;selectorDelay=700;
        onSelection=()=>{if(!reset&&first){reset=true;first.socket?.destroy();}};
        let finish!:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});
        const server=createServer(async(req,res)=>{
            if(req.url==='/warm'){res.end('warm');return;}
            if(req.url==='/done'){res.end('done');finish();return;}
            if(req.url==='/summary'){const value={receipts,accountingBefore:before,accountingAfter:await accounting(),embeddingCalls:embed.mock.calls.length-initialEmbed,selectionCalls:generate.mock.calls.length-initialSelect};res.setHeader('content-type','application/json');res.end(JSON.stringify(value));return;}
            if(req.method!=='POST'){
                res.setHeader('content-type','text/html');res.end(`<title>Controlled Ask replay reset</title><button id="warm">Warm connection</button><button id="send">Send once</button><button id="summary">Show evidence</button><button id="done">Finish probe</button><pre id="result"></pre><script>let dispatches=0;const body=${JSON.stringify(body)};warm.onclick=async()=>{await fetch('/warm');result.textContent='Warm connection ready'};send.onclick=async()=>{send.disabled=true;dispatches++;try{const r=await fetch('/api/chat/notes',{method:'POST',headers:{'content-type':'application/json','x-dispatch-id':'native-reset-1'},body:JSON.stringify(body)});result.textContent=JSON.stringify({dispatches,status:r.status,response:await r.text()})}catch(e){result.textContent=JSON.stringify({dispatches,error:e.name})}};summary.onclick=async()=>{const r=await fetch('/summary');result.textContent=JSON.stringify({dispatches,evidence:await r.json()},null,2)};done.onclick=()=>fetch('/done');</script>`);return;
            }
            const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
            const receiptId=randomUUID();
            receipts.push({receiptId,dispatchId:String(req.headers['x-dispatch-id']),attemptId:body.replay.attemptId,socketPort:req.socket.remotePort});
            const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});
            if(!first)first=res;
            const response=await POST(new NextRequest('http://127.0.0.1:3089/api/chat/notes',{method:'POST',headers:{'content-type':'application/json','x-evidence-protocol':'ui'},body:Buffer.concat(chunks).toString(),signal:abort.signal}));
            const outcome=await response.clone().json().catch(()=>null);responses.push({receiptId,status:response.status,...(outcome?.error?.code?{code:outcome.error.code}:{})});
            if(!res.destroyed){res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}
        });
        await new Promise<void>(resolve=>server.listen(3089,'127.0.0.1',resolve));
        try {await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(new Error('CUA browser probe time limit')),540000))]);}
        finally {
            server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));onSelection=undefined;selectorDelay=0;
            // Keep failed/time-limited browser attempts in the evidence too.
            writeFileSync(fixtureRoot+'/native-reset-evidence.json',JSON.stringify({receipts,responses,before,after:await accounting(),embeddingCalls:embed.mock.calls.length-initialEmbed,selectionCalls:generate.mock.calls.length-initialSelect},null,2));
        }
        const after=await accounting();
        expect(responses.some(response=>response.status===409&&['ASK_ATTEMPT_OUTCOME_UNCERTAIN','ASK_ATTEMPT_IN_PROGRESS'].includes(response.code??''))).toBe(true);
        expect(receipts.length).toBeGreaterThanOrEqual(2);expect(new Set(receipts.map(x=>x.dispatchId)).size).toBe(1);
        expect(after.usage-before.usage).toBe(1);expect(embed.mock.calls.length-initialEmbed).toBe(1);expect(generate.mock.calls.length-initialSelect).toBe(1);
    },560000);
});
