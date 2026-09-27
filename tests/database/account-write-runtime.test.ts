import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
const url=process.env.DB107_ADMIN_DATABASE_URL;
if(process.env.ACCOUNT_WRITE_RUNTIME_REQUIRED==='1' && !url) throw new Error('Disposable database required');
(url?describe:describe.skip)('remaining account mutation boundaries',()=>{
 const db=new Pool({connectionString:url,max:10});
 const a=randomUUID(),b=randomUUID(),item=randomUUID(),request=randomUUID();
 async function asUser(sql:string,args:unknown[]=[],user=a,role='authenticated'){
  const c=await db.connect();try{await c.query('BEGIN');await c.query(`SET LOCAL ROLE ${role}`);await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,role})]);const result=await c.query(sql,args);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 const feedback=(user=a,details='text')=>asUser('INSERT INTO public.content_feedback(user_id,content_id,is_positive,details) VALUES($1,$2,true,$3) ON CONFLICT(user_id,content_id) DO UPDATE SET details=EXCLUDED.details',[user,item,details],user);
 beforeAll(async()=>{
  for(const u of [a,b])await db.query("INSERT INTO auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'{}','{}',now(),now())",[u,`account-${u}@netflux.blog`]);
  await db.query("INSERT INTO public.content_item(id,type,title,status) VALUES($1,'article','Account write fixture','verified')",[item]);
  await db.query("INSERT INTO public.content_requests(id,title,normalized_title,submitted_by) VALUES($1,$2,$2,$3)",[request,`Fixture ${request}`,a]);
 });
 beforeEach(async()=>{await db.query('DELETE FROM private.account_write_budget WHERE user_id=ANY($1::uuid[])',[[a,b]]);await db.query('DELETE FROM public.content_feedback WHERE user_id=ANY($1::uuid[])',[[a,b]]);await db.query("UPDATE public.profiles SET onboarding_state='{}' WHERE id=ANY($1::uuid[])",[[a,b]]);});
 afterAll(async()=>{await db.query('DELETE FROM auth.users WHERE id=ANY($1::uuid[])',[[a,b]]);await db.query('DELETE FROM public.content_requests WHERE id=$1',[request]);await db.query('DELETE FROM public.content_item WHERE id=$1',[item]);await db.end();});
 it('serializes the final feedback unit, counts upserts once and isolates accounts',async()=>{
  await feedback();await feedback();expect((await db.query("SELECT writes FROM private.account_write_budget WHERE user_id=$1 AND collection='content_feedback'",[a])).rows[0].writes).toBe(2);
  await db.query('UPDATE private.account_write_budget SET writes=19 WHERE user_id=$1',[a]);
  const results=await Promise.allSettled(Array.from({length:6},()=>feedback()));expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected').map(r=>r.status==='rejected'?r.reason.code:null)).toEqual(Array(5).fill('PT429'));await feedback(b);
 });
 it('allows mixed update/upsert writers without inverse-lock deadlocks',async()=>{
  await feedback();const results=await Promise.allSettled(Array.from({length:12},(_,i)=>i%2?feedback():asUser('UPDATE public.content_feedback SET is_positive=NOT is_positive WHERE user_id=$1',[a])));
  expect(results.map(r=>r.status==='fulfilled'?'ok':{code:r.reason.code,message:r.reason.message,where:r.reason.where})).toEqual(Array(12).fill('ok'));expect((await db.query("SELECT writes FROM private.account_write_budget WHERE user_id=$1 AND collection='content_feedback'",[a])).rows[0].writes).toBe(13);
 });
 it('serializes mixed delete/upsert and rolls back a refused deletion',async()=>{
  await feedback();const results=await Promise.allSettled(Array.from({length:12},(_,i)=>i%2?feedback():asUser('DELETE FROM public.content_feedback WHERE user_id=$1',[a])));expect(results.map(r=>r.status==='fulfilled'?'ok':r.reason.code)).toEqual(Array(12).fill('ok'));
  await feedback();await db.query("UPDATE private.account_write_budget SET writes=20 WHERE user_id=$1 AND collection='content_feedback'",[a]);await expect(asUser('DELETE FROM public.content_feedback WHERE user_id=$1',[a])).rejects.toMatchObject({code:'PT429'});expect((await db.query('SELECT count(*) FROM public.content_feedback WHERE user_id=$1',[a])).rows[0].count).toBe('1');
 });
 it('bounds raw feedback fields, preserves ownership and rolls back rejected budget charges',async()=>{
  await feedback(a,'x'.repeat(4000));await expect(feedback(a,'x'.repeat(4001))).rejects.toMatchObject({code:'22001'});
  await expect(asUser('UPDATE public.content_feedback SET reason=$1 WHERE user_id=$2',['x'.repeat(257),a])).rejects.toMatchObject({code:'22001'});
  await expect(asUser('INSERT INTO public.content_feedback(user_id,content_id,is_positive) VALUES($1,$2,true)',[b,item])).rejects.toMatchObject({code:'42501'});
  expect((await db.query('SELECT writes FROM private.account_write_budget WHERE user_id=$1',[a])).rows[0].writes).toBe(1);
  await asUser('DELETE FROM public.content_feedback WHERE user_id=$1',[a]);expect((await db.query('SELECT writes FROM private.account_write_budget WHERE user_id=$1',[a])).rows[0].writes).toBe(2);
 });
 it('bounds notification upserts and renews an expired window',async()=>{
  const save=()=>asUser('INSERT INTO public.user_notification_preferences(user_id,request_published_email_enabled) VALUES($1,false) ON CONFLICT(user_id) DO UPDATE SET request_published_email_enabled=EXCLUDED.request_published_email_enabled',[a]);
  await save();await expect(asUser('UPDATE public.user_notification_preferences SET unsubscribe_token=$1 WHERE user_id=$2',['x'.repeat(257),a])).rejects.toMatchObject({code:'22001'});await db.query("UPDATE private.account_write_budget SET writes=20 WHERE user_id=$1 AND collection='user_notification_preferences'",[a]);await expect(save()).rejects.toMatchObject({code:'PT429'});
  await db.query("UPDATE private.account_write_budget SET window_started_at=now()-interval '61 seconds' WHERE user_id=$1",[a]);await save();expect((await db.query('SELECT writes FROM private.account_write_budget WHERE user_id=$1',[a])).rows[0].writes).toBe(1);
 });
 it('bounds direct onboarding JSON and the invoker RPC without granting other profile columns',async()=>{
  await asUser("SELECT public.set_onboarding_state('welcome','v1','completed')");
  const entry={version:'v1',status:'completed',updated_at:new Date().toISOString()};
  const value=Object.fromEntries(Array.from({length:32},(_,i)=>['tour'+i,entry]));
  await asUser('UPDATE public.profiles SET onboarding_state=$1 WHERE id=$2',[value,a]);
  await expect(asUser('UPDATE public.profiles SET onboarding_state=$1 WHERE id=$2',[{...value,extra:entry},a])).rejects.toMatchObject({code:'22023'});
  for(const invalid of [[],{tour:{...entry,extra:'bad'}},{tour:{...entry,version:'x'.repeat(33)}},{tour:null}])await expect(asUser('UPDATE public.profiles SET onboarding_state=$1 WHERE id=$2',[JSON.stringify(invalid),a])).rejects.toMatchObject({code:'22023'});
  await expect(asUser("UPDATE public.profiles SET role='admin' WHERE id=$1",[a])).rejects.toMatchObject({code:'42501'});
  await expect(asUser("UPDATE public.profiles SET reader_settings='{}' WHERE id=$1",[a])).rejects.toMatchObject({code:'42501'});
  await db.query("UPDATE private.account_write_budget SET writes=30 WHERE user_id=$1 AND collection='profiles'",[a]);await expect(asUser("SELECT public.set_onboarding_state('tour0','v2','dismissed')")).rejects.toMatchObject({code:'PT429'});
 });
 it('denies browser mutations and private helper/counter access while preserving trusted writers',async()=>{
  for(const role of ['anon','authenticated']){
   for(const table of ['content_request_votes','reading_activity','ai_message_usage']){
    const p=await db.query("SELECT has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed,has_any_column_privilege($1,$2,'INSERT,UPDATE,REFERENCES') columns",[role,'public.'+table]);expect(p.rows[0]).toEqual({allowed:false,columns:false});
    await expect(asUser(`DELETE FROM public.${table} WHERE user_id=$1`,[a],a,role)).rejects.toMatchObject({code:'42501'});
   }
   await expect(asUser('SELECT * FROM private.account_write_budget',[],a,role)).rejects.toMatchObject({code:'42501'});
   await expect(asUser("SELECT private.admit_account_write('profiles')",[],a,role)).rejects.toMatchObject({code:'42501'});
  }
  await asUser('INSERT INTO public.content_request_votes(user_id,request_id) VALUES($1,$2)',[a,request],a,'service_role');
  expect((await db.query('SELECT vote_count FROM public.content_requests WHERE id=$1',[request])).rows[0].vote_count).toBe(1);
  await asUser('DELETE FROM public.content_request_votes WHERE user_id=$1 AND request_id=$2',[a,request],a,'service_role');expect((await db.query('SELECT vote_count FROM public.content_requests WHERE id=$1',[request])).rows[0].vote_count).toBe(0);
  const result=await asUser("SELECT public.admit_ai_usage($1,'ask-notes',3,5,10) result",[a],a,'service_role');expect(result.rows[0].result.allowed).toBe(true);
  await asUser('INSERT INTO public.reading_activity(user_id,activity_date,duration_seconds) VALUES($1,current_date,60) ON CONFLICT(user_id,activity_date) DO UPDATE SET duration_seconds=60',[a],a,'service_role');
  await asUser('DELETE FROM public.reading_activity WHERE user_id=$1',[a],a,'service_role');
 });
 const apiUrl=process.env.DB107_SUPABASE_URL,anonKey=process.env.DB107_SUPABASE_ANON_KEY,serviceKey=process.env.DB107_SUPABASE_SERVICE_ROLE_KEY;
 (apiUrl&&anonKey&&serviceKey?it:it.skip)('enforces direct Data API bounds with real authentication',async()=>{
  const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(apiUrl!,serviceKey!,options),client=createClient(apiUrl!,anonKey!,options);
  const email=`remaining-${randomUUID()}@netflux.blog`,password=`Test-${randomUUID()}!`;const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error||!created.data.user)throw created.error??new Error('No fixture user');const id=created.data.user.id;
  try{expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
   expect((await client.from('content_feedback').upsert({user_id:id,content_id:item,is_positive:true})).error).toBeNull();
   await db.query('UPDATE private.account_write_budget SET writes=20 WHERE user_id=$1',[id]);expect((await client.from('content_feedback').update({is_positive:false}).eq('user_id',id)).status).toBe(429);
   for(const table of ['content_request_votes','reading_activity','ai_message_usage'])expect((await client.from(table).delete().eq('user_id',id)).status).toBe(403);
  }finally{await client.auth.signOut({scope:'global'});const removed=await admin.auth.admin.deleteUser(id);if(removed.error)throw removed.error;}
  expect((await db.query('SELECT count(*) FROM private.account_write_budget WHERE user_id=$1',[id])).rows[0].count).toBe('0');
 });
});
