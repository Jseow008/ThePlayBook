/** Bounded, manually reviewed real-provider acceptance. Loopback candidate only. */
import { strict as assert } from 'node:assert';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect } from '@playwright/test';
import { parse } from 'dotenv';
import { newNotesReplayAttemptId } from '../../lib/notes-replay-attempt.ts';
import { auditTotal } from './ai-chat-acceptance-audit.mjs';

export function acceptancePayload(test, plan, owner) {
    const messages = [...(test.history ?? []), { id: randomUUID(), role: 'user', content: test.question }];
    if (test.chat === 'library') return { path: '/api/chat', body: { messages } };
    if (test.chat === 'notes') return { path: '/api/chat/notes', body: { messages, scope: test.scope,
        replay: { expectedOwner: owner, chatId: randomUUID(), questionId: messages.at(-1).id, attemptId: newNotesReplayAttemptId() } } };
    const book = plan.publicSources.find(x => x.id === test.book);
    assert(book, 'Author source must be in frozen plan');
    return { path: '/api/chat/author', body: { messages, contentId: book.id, authorName: book.author, contentTitle: book.title } };
}
export function decodeStream(body) {
    const events = body.split('\n').filter(x => x.startsWith('data: ') && x.slice(6) !== '[DONE]').flatMap(line => {
        try { return [JSON.parse(line.slice(6))]; } catch { return []; }
    });
    return { text: events.filter(x => x.type === 'text-delta').map(x => x.delta).join(''),
        citations: events.filter(x => x.type === 'data-citations').flatMap(x => x.data),
        errors: events.filter(x => x.type === 'error'), types: events.map(x => x.type) };
}
const sha = value => createHash('sha256').update(value).digest('hex');
const required = name => { assert(process.env[name], `Missing ${name}`); return process.env[name]; };
const files = ['lib/server/author-evidence.ts','lib/server/retrieval-user-context.ts','lib/server/interactive-ai.ts','lib/server/retrieval-generation.ts','app/api/chat/route.ts','app/api/chat/notes/route.ts','app/api/chat/author/route.ts','lib/server/personal-evidence-selector.ts','lib/server/library-evidence.ts','lib/server/personal-retrieval.ts','lib/server/evidence-citation.ts'];
export function acceptanceCases(plan, stage) {
    if (stage === 'pilot') return plan.pilot;
    if (stage === 'pilot-ui') return plan.ui;
    if (stage === 'held-highlight-validation') return plan.held.filter(test => test.id === 'N03');
    return plan.held.filter(test => test.chat === stage.slice('held-'.length));
}
export const candidateIdentity = () => sha(JSON.stringify(Object.fromEntries(files.map(path => [path, sha(readFileSync(path))]))));

async function main(stage) {
    assert(['pilot','pilot-ui','held-library','held-notes','held-author','held-highlight-validation'].includes(stage), 'Choose pilot or a held group');
    const origin = required('AI_ACCEPTANCE_ORIGIN');
    assert(['localhost','127.0.0.1'].includes(new URL(origin).hostname), 'Live website traffic is forbidden');
    const dir = resolve(required('AI_ACCEPTANCE_OUTPUT'));
    const plan = JSON.parse(readFileSync(dir + '/plan.json'));
    const planHash = sha(JSON.stringify(plan)), candidateHash = candidateIdentity();
    assert.equal(plan.model, 'gpt-6-luna'); assert.equal(plan.reasoningEffort, 'none');
    if (stage.startsWith('held-')) {
        const review = JSON.parse(readFileSync(dir + '/pilot-review.json'));
        assert(review.passed && review.candidateHash === candidateHash && review.planHash === planHash, 'Passing hash-bound pilot review required');
    }
    const env = parse(readFileSync(required('AI_ACCEPTANCE_ENV_FILE')));
    assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0], required('AI_ACCEPTANCE_PROJECT_REF'));
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
    const users = [], accounts = [], cases = [], checks = [], pageErrors = [], contexts = [];
    const run = { stage, startedAt: new Date().toISOString(), origin, planHash, candidateHash, users, cases, checks, pageErrors };
    if (process.env.AI_ACCEPTANCE_REUSE_VERIFIED_FILE) {
        assert.equal(stage, 'pilot');
        const priorRun = JSON.parse(readFileSync(process.env.AI_ACCEPTANCE_REUSE_VERIFIED_FILE));
        assert(priorRun.cleanup.verified && priorRun.candidateHash === candidateHash && priorRun.planHash === planHash, 'Reusable evidence inputs changed');
        for (const item of priorRun.cases) assert(item.checks.http && item.checks.stream && item.checks.exact !== false && item.checks.citation !== false, 'Invalid evidence cannot be reused');
        cases.push(...priorRun.cases);
        run.reusedEvidence = { source: process.env.AI_ACCEPTANCE_REUSE_VERIFIED_FILE, ids: priorRun.cases.map(x=>x.id), reason: 'Only unchanged valid cases reused after environment/capture failure; failed attempt retained.' };
    }
    const path = dir + '/' + stage + '.json';
    assert(!exists(path), 'Do not overwrite a previous attempt');
    const save = () => writeFileSync(path, JSON.stringify(run,null,2));
    const ok = (result, label) => { assert(!result.error, label + ': ' + (result.error?.code ?? '')); return result.data; };
    const auditPath = required('AI_ACCEPTANCE_AUDIT'), prior = Number(required('AI_ACCEPTANCE_PRIOR_USD'));
    const auditRows = () => exists(auditPath) ? readFileSync(auditPath,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x)) : [];
    run.auditOffset = auditRows().length;
    let browser, lastStarted = 0, lastPage;
    const pendingByContext = new Map();
    async function settleClose(ctx) {
        const pending = pendingByContext.get(ctx);
        if (pending) await expect.poll(() => pending.size, { timeout: 20000 }).toBe(0);
        await ctx.close();
    }
    try {
        save();
        const health = await fetch(origin + '/api/health', { headers: {'x-health-check-secret':env.HEALTH_CHECK_SECRET} });
        assert.equal(health.status,200); checks.push({id:'health',status:health.status});
        for (let n=0;n<2;n++) {
            const password=randomUUID()+'Aa1!',email='ai-routing-acceptance-'+randomUUID()+'@example.invalid';
            const {user}=ok(await admin.auth.admin.createUser({email,password,email_confirm:true}),'create own fixture');
            users.push(user.id); save();
            ok(await admin.from('profiles').update({is_internal:true}).eq('id',user.id),'own internal test marker');
            const jar=[];
            const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>jar,setAll:values=>{for(const c of values){const i=jar.findIndex(x=>x.name===c.name);if(i>=0)jar.splice(i,1);jar.push(c);}}}});
            ok(await auth.auth.signInWithPassword({email,password}),'sign in');
            const claims=ok(await auth.auth.getClaims(),'session identity').claims;
            accounts.push({auth,jar,owner:JSON.stringify([user.id,claims.session_id])});
        }
        const current=ok(await admin.from('content_item').select('id,reading_revision').in('id',plan.publicSources.map(x=>x.id)),'source revisions');
        const revision=id=>current.find(x=>x.id===id).reading_revision;
        const lee=plan.publicSources.find(x=>x.author==='Lee Kuan Yew'),tolle=plan.publicSources.find(x=>x.author==='Eckhart Tolle');
        ok(await admin.from('user_library').insert(plan.publicSources.map(x=>({user_id:users[0],content_id:x.id,is_bookmarked:true,last_interacted_at:new Date().toISOString()}))),'private library');
        const reflections=[{user_id:users[0],content_item_id:lee.id,prompt:'Phone and bedtime reading',reflection_text:plan.fixtures.phone},{user_id:users[0],content_item_id:tolle.id,prompt:'Practicing presence',reflection_text:plan.fixtures.presence},{user_id:users[1],content_item_id:lee.id,prompt:'Private recovery phrase',reflection_text:plan.fixtures.secret}];
        ok(await admin.from('user_reflections').insert(reflections.map(x=>({...x,content_revision:revision(x.content_item_id)}))),'private reflections');
        const sources=JSON.parse(readFileSync(dir+'/sources.json'));
        const liveSegments=ok(await admin.from('segment').select('id,title,markdown_body').in('item_id',plan.publicSources.map(x=>x.id)),'source snapshot verification');
        assert.equal(liveSegments.length,sources.segments.length,'Source collection changed since questions were frozen');
        for(const original of sources.segments){const live=liveSegments.find(x=>x.id===original.id);assert(live&&live.title===original.title&&live.markdown_body===original.markdown_body,'Ground-truth source changed since freeze');}
        checks.push({id:'frozen-public-sources-unchanged',segments:liveSegments.length});
        const segment=sources.segments.find(x=>x.title==='The Push for Merger and Federal Tensions');
        ok(await admin.from('user_highlights').insert({user_id:users[0],content_item_id:lee.id,content_revision:revision(lee.id),segment_id:segment.id,highlighted_text:plan.fixtures.highlight,note_body:plan.fixtures.disagreement,color:'blue'}),'private highlight');
        if(stage==='held-notes'||stage==='held-highlight-validation'){
            // Highlights-only deliberately excludes records with an attached note.
            ok(await admin.from('user_highlights').insert({user_id:users[0],content_item_id:lee.id,content_revision:revision(lee.id),segment_id:segment.id,highlighted_text:plan.fixtures.highlight,note_body:null,color:'yellow'}),'eligible bare highlight');
            checks.push({id:'highlight-scope-fixture',noteBody:null,color:'yellow',correction:'Original N03 setup had no eligible bare highlight; original failed acquisition retained.'});
        }
        browser=await chromium.launch();
        async function context(width=1440) {
            const ctx=await browser.newContext({baseURL:origin,...(process.env.AI_ACCEPTANCE_LOCAL_INGRESS==='1'?{extraHTTPHeaders:{'x-vercel-forwarded-for':'127.0.0.1','x-forwarded-for':'127.0.0.1'}}:{}),viewport:{width,height:width===390?844:900}});contexts.push(ctx);
            const pending = new Set(); pendingByContext.set(ctx, pending);
            ctx.on('request', request => { const url = new URL(request.url()); if (url.origin === origin && url.pathname.startsWith('/api/')) pending.add(request); });
            ctx.on('requestfinished', request => pending.delete(request));
            ctx.on('requestfailed', request => pending.delete(request));
            await ctx.addCookies(accounts[0].jar.map(c=>({name:c.name,value:c.value,domain:new URL(origin).hostname,path:'/',secure:false,sameSite:'Lax'})));
            await ctx.addInitScript(()=>{
                window.__acceptance=[]; const original=window.fetch;
                window.fetch=async function(...args){
                    const path=new URL(String(args[0]?.url??args[0]),location.origin).pathname;
                    let rec;if(['/api/chat','/api/chat/notes','/api/chat/author'].includes(path)){rec={path,started:performance.now(),done:false};window.__acceptance.push(rec);}
                    try{const response=await original.apply(this,args);if(rec){rec.status=response.status;rec.headersMs=performance.now()-rec.started;void(async()=>{try{const reader=response.clone().body.getReader(),decoder=new TextDecoder();let body='';while(true){const{value,done}=await reader.read();if(done)break;body+=decoder.decode(value,{stream:true});if(rec.firstTextMs===undefined&&body.split('\n').some(line=>{try{const event=JSON.parse(line.slice(6));return line.startsWith('data: ')&&event.type==='text-delta'&&event.delta?.trim();}catch{return false;}}))rec.firstTextMs=performance.now()-rec.started;}rec.body=body;rec.totalMs=performance.now()-rec.started;}catch(e){rec.error=e.name;}finally{rec.done=true;}})();}return response;}catch(e){if(rec){rec.done=true;rec.error=e.name;}throw e;}
                };
            });
            return ctx;
        }
        const setup=await context();
        assert(auditTotal(auditRows(),prior)+.40<5,'Insufficient remaining budget for bounded indexing');
        const indexed=await setup.request.get(origin+'/api/admin/personal-evidence/process',{headers:{authorization:'Bearer '+env.CRON_SECRET},timeout:65000});
        checks.push({id:'index',status:indexed.status(),body:await indexed.json()});save();assert.equal(indexed.status(),200);
        assert(auditRows().slice(run.auditOffset).some(row=>row.type==='reserve'&&row.provider==='google'),
            'No provider-audit evidence from indexing; stop before chat dispatch');
        for(const route of stage==='pilot'?['/api/chat','/api/chat/notes','/api/chat/author']:[]){
            const res=await setup.request.post(origin+route,{headers:{'x-evidence-protocol':'ui'},data:{}});
            assert.equal(res.status(),400); checks.push({id:'free-preflight',route,status:res.status()});
        }
        const list=acceptanceCases(plan,stage);
        const apiPage=await setup.newPage();await apiPage.goto('/ask');
        for(const test of list){
            if(cases.some(x=>x.id===test.id))continue;
            assert.equal(candidateIdentity(),candidateHash,'Code changed during fixed evaluation');
            assert(auditTotal(auditRows(),prior)+1.06<5,'Insufficient remaining budget for another question');
            const pause=6500-(Date.now()-lastStarted);if(pause>0)await new Promise(r=>setTimeout(r,pause));lastStarted=Date.now();
            const http=process.env.AI_ACCEPTANCE_HTTP!=='0';
            const ui=stage==='pilot-ui'||(stage==='pilot'&&process.env.AI_ACCEPTANCE_PILOT_MODE==='ui'),width=test.width??(test.id==='P-N2'?390:1440);
            const ctx=ui?await context(width):setup,page=ui?await ctx.newPage():apiPage;
            lastPage=page;run.currentCase=test.id;
            const onPageError=e=>pageErrors.push({caseId:test.id,name:e.name,message:e.message.slice(0,250)});page.on('pageerror',onPageError);
            let offset=ui?0:await page.evaluate(()=>window.__acceptance.length);
            const requestPath=test.chat==='library'?'/api/chat':test.chat==='notes'?'/api/chat/notes':'/api/chat/author';
            let composerLabel,sendLabel;
            const warmups=[];
            async function sendUi(question){
                await page.getByLabel(composerLabel,{exact:true}).fill(question);
                await expect(page.getByLabel(sendLabel,{exact:true})).toBeEnabled({timeout:20000});
                await page.getByLabel(composerLabel,{exact:true}).press('Enter');
            }
            if(ui){
                if(test.chat==='library'){await page.goto('/ask');composerLabel='Ask a question about your library';sendLabel='Send message';}
                else if(test.chat==='notes'){
                    await page.goto(test.scope.itemType==='reflection'?'/notes?type=reflection':'/notes');
                    await page.getByRole('button',{name:width===390?'Ask':'Ask these notes',exact:true}).click();
                    composerLabel=width===390?'Ask a question about these notes':'Ask a question about the notes in view';sendLabel='Send notes question';
                }else{const book=plan.publicSources.find(x=>x.id===test.book);await page.goto('/read/'+book.id);await page.getByRole('button',{name:'Discuss ideas',exact:true}).click();composerLabel='Ask '+book.author+' a question';sendLabel='Send message';}
                for(const previous of (test.history??[]).filter(x=>x.role==='user')){
                    assert(auditTotal(auditRows(),prior)+1.06<5,'Insufficient budget for a real conversation warmup');
                    const pending=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===requestPath,{timeout:80000});
                    await sendUi(previous.content);const response=await pending,body=await response.text(),decoded=decodeStream(body);
                    assert.equal(response.status(),200);assert(decoded.text&&!decoded.errors.length,'Conversation warmup failed');
                    warmups.push({question:previous.content,text:decoded.text,status:response.status()});
                }
                offset=await page.evaluate(()=>window.__acceptance.length);
            }
            let networkStarted;
            const started=request=>{if(request.method()==='POST'&&new URL(request.url()).pathname===requestPath)networkStarted=performance.now();};
            page.on('request',started);
            let direct;
            const networkCapture=http&&!ui?null:page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===requestPath,{timeout:80000}).then(async response=>{const body=await response.text();return {status:response.status(),body,totalMs:performance.now()-networkStarted,firstTextMs:null,capture:'browser-network'};});
            // Attach rejection handling immediately while the UI action is pending.
            void networkCapture?.catch(()=>{});
            if(ui){await sendUi(test.question);
            }else{
                const payload=acceptancePayload(test,plan,accounts[0].owner);
                if(http){
                    const started=performance.now(),cookie=accounts[0].jar.map(c=>c.name+'='+c.value).join('; ');
                    const response=await fetch(origin+payload.path,{method:'POST',headers:{'Content-Type':'application/json','x-evidence-protocol':'ui',Origin:origin,Cookie:cookie,...(process.env.AI_ACCEPTANCE_LOCAL_INGRESS==='1'?{'x-vercel-forwarded-for':'127.0.0.1','x-forwarded-for':'127.0.0.1'}:{})},body:JSON.stringify(payload.body),signal:AbortSignal.timeout(80000)});
                    direct={status:response.status,headersMs:performance.now()-started,firstTextMs:null,capture:'http-stream'};
                    const reader=response.body.getReader(),decoder=new TextDecoder();let body='';
                    while(true){const{value,done}=await reader.read();if(done)break;body+=decoder.decode(value,{stream:true});if(direct.firstTextMs===null&&decodeStream(body).text.trim())direct.firstTextMs=performance.now()-started;}
                    direct.body=body;direct.totalMs=performance.now()-started;
                }else await page.evaluate(async({path,body})=>{await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','x-evidence-protocol':'ui'},body:JSON.stringify(body)}).then(r=>r.text());},payload);
            }
            const network=direct??await networkCapture;
            const client=direct?null:await page.evaluate(({offset,path})=>window.__acceptance.slice(offset).find(x=>x.path===path&&x.done),{offset,path:requestPath});
            const record=client?.body?{...client,capture:'browser-fetch-clone'}:network,decoded=decodeStream(record.body??'');
            page.off('request',started);page.off('pageerror',onPageError);
            const result={id:test.id,chat:test.chat,question:test.question,expected:test.expected,mode:ui?'actual UI':http?'authenticated HTTP API':'authenticated browser API',width:ui?width:undefined,uiWarmups:ui?warmups:undefined,uiSubmit:ui?'keyboard Enter':undefined,capture:record.capture,status:record.status,firstTextMs:record.firstTextMs??null,totalMs:record.totalMs,body:record.body,...decoded,checks:{http:record.status===200,stream:decoded.text.length>0&&!decoded.errors.length,exact:test.exact?decoded.text===test.exact:null,citation:test.citation?decoded.citations.length>0:null,privacy:test.forbidden?!decoded.text.includes(test.forbidden):null}};
            for(const citation of decoded.citations.slice(0,2)){
                const token=citation.href.split('#')[1],res=await ctx.request.post(origin+'/api/evidence/resolve',{data:{token}}),body=await res.json();
                result.citationResolutions??=[];result.citationResolutions.push({label:citation.label,status:res.status(),body});
            }
            cases.push(result);save();console.log(JSON.stringify({id:test.id,status:result.status,firstTextMs:result.firstTextMs,totalMs:result.totalMs,checks:result.checks}));
            if(ui){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:dir+'/'+test.id+'.png'});await settleClose(ctx);}
            if(!result.checks.http||!result.checks.stream){run.stopped='First invalid response, no provider retry';break;}
        }
        run.completed=cases.length===list.length;run.costUpperUsd=auditTotal(auditRows(),prior);
    }catch(error){if(lastPage)await lastPage.screenshot({path:dir+'/'+stage+'-failure.png',timeout:5000}).catch(()=>{});run.failure={name:error.name,message:error.message.slice(0,4000)};console.log(JSON.stringify({stage,error:run.failure}));}
    finally{
        for(const ctx of contexts)await settleClose(ctx).catch(error=>{run.cleanupSettleError=error.message.slice(0,200);});if(browser)await browser.close();
        const revoked=[];for(const account of accounts){const result=await account.auth.auth.signOut({scope:'global'});revoked.push(!result.error);}
        let deleted=0;for(const id of users){if(!(await admin.auth.admin.deleteUser(id)).error)deleted++;}
        const counts={};for(const[table,col]of[['profiles','id'],['user_library','user_id'],['user_reflections','user_id'],['user_highlights','user_id']]){const result=await admin.from(table).select('*',{count:'exact',head:true}).in(col,users.length?users:[randomUUID()]);counts[table]=result.error?null:result.count;}
        run.cleanup={created:users.length,deleted,revoked,remaining:counts,verified:deleted===users.length&&revoked.every(Boolean)&&Object.values(counts).every(x=>x===0)};run.endedAt=new Date().toISOString();save();assert(run.cleanup.verified,'Own fixture cleanup incomplete');console.log(JSON.stringify({stage,completed:run.completed,cases:cases.length,cleanup:run.cleanup.verified,costUpperUsd:run.costUpperUsd}));
    }
}
function exists(path){try{readFileSync(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
    if(process.argv[2]==='held'){
        // Normal message allowance remains intact; use separate owned fixtures per chat.
        for(const stage of ['held-library','held-notes','held-author'])await main(stage);
    }else await main(process.argv[2]);
}
