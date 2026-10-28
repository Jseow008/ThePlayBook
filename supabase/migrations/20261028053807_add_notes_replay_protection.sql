-- Replay ownership is separate from accounting policy. Existing quota/spend
-- functions are called unchanged, inside the same transactions as their bindings.
CREATE TABLE private.notes_replay_questions (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL, chat_id text NOT NULL CHECK(length(chat_id) BETWEEN 1 AND 128),
 question_id text NOT NULL CHECK(length(question_id) BETWEEN 1 AND 128), active_attempt uuid,
 PRIMARY KEY(user_id,session_id,chat_id,question_id)
);
CREATE TABLE private.notes_replay_attempts (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, session_id uuid NOT NULL,
 attempt_id uuid NOT NULL, chat_id text NOT NULL, question_id text NOT NULL, retry_of uuid,
 key_id text NOT NULL, fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 owner_nonce uuid NOT NULL DEFAULT gen_random_uuid(),
 state text NOT NULL DEFAULT 'claimed' CHECK(state IN ('claimed','running','completed','failed','uncertain')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 work_until timestamptz NOT NULL DEFAULT clock_timestamp()+interval '120 seconds',
 admission jsonb, failure_code text, failure_status integer,
 cache jsonb, cache_bytes integer NOT NULL DEFAULT 0 CHECK(cache_bytes BETWEEN 0 AND 530000),
 cache_until timestamptz,
 PRIMARY KEY(user_id,session_id,attempt_id),
 FOREIGN KEY(user_id,session_id,chat_id,question_id) REFERENCES private.notes_replay_questions
);
CREATE INDEX notes_replay_attempt_age ON private.notes_replay_attempts(created_at);
CREATE INDEX notes_replay_attempt_question ON private.notes_replay_attempts(user_id,session_id,chat_id,question_id);
CREATE INDEX notes_replay_cache_age ON private.notes_replay_attempts(cache_until) WHERE cache IS NOT NULL;
CREATE TABLE private.notes_replay_stages (
 user_id uuid NOT NULL, session_id uuid NOT NULL, attempt_id uuid NOT NULL,
 stage text NOT NULL CHECK(stage IN ('embedding','selection')), operation_id uuid NOT NULL UNIQUE,
 admission jsonb NOT NULL,
 PRIMARY KEY(user_id,session_id,attempt_id,stage),
 FOREIGN KEY(user_id,session_id,attempt_id) REFERENCES private.notes_replay_attempts ON DELETE CASCADE
);
ALTER TABLE private.notes_replay_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.notes_replay_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.notes_replay_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.notes_replay_questions,private.notes_replay_attempts,private.notes_replay_stages FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private.notes_replay_questions,private.notes_replay_attempts,private.notes_replay_stages TO service_role;

-- Only this guard needs auth-schema access; it cannot return session/user data.
CREATE FUNCTION private.notes_replay_live(p_user uuid,p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_user IS NULL OR p_session IS NULL OR NOT EXISTS (
  SELECT 1 FROM auth.sessions WHERE id=p_session AND user_id=p_user AND (not_after IS NULL OR not_after>clock_timestamp())
 ) THEN RAISE EXCEPTION 'Live session required' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.notes_replay_live(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.notes_replay_live(uuid,uuid) TO service_role;

CREATE FUNCTION public.notes_replay(p_action text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,private
SET lock_timeout='500ms' SET statement_timeout='10s' AS $$
DECLARE
 u uuid := (p_input->>'userId')::uuid; s uuid := (p_input->>'sessionId')::uuid;
 a uuid := (p_input->>'attemptId')::uuid; c text := p_input->>'chatId'; q text := p_input->>'questionId';
 parent uuid := (p_input->>'retryOf')::uuid; n uuid := (p_input->>'ownerNonce')::uuid;
 active uuid; r private.notes_replay_attempts%ROWTYPE; old private.notes_replay_attempts%ROWTYPE;
 result jsonb; op uuid; stage_name text; embedded_ms bigint; now_at timestamptz;
 k text := p_input->>'keyId'; fp text; item record; global_bytes bigint; account_bytes bigint; bytes integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service required' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Read committed required' USING ERRCODE='25001'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('claim','check','admit','reserve','settle','finish','fail')
 OR u IS NULL OR s IS NULL OR a IS NULL OR c IS NULL OR q IS NULL
 OR length(c) NOT BETWEEN 1 AND 128 OR length(q) NOT BETWEEN 1 AND 128 THEN
  RAISE EXCEPTION 'Invalid replay identity' USING ERRCODE='22023'; END IF;
 IF p_action<>'settle' THEN PERFORM private.notes_replay_live(u,s); END IF;
 now_at:=clock_timestamp();
 IF p_action='claim' THEN
  SELECT * INTO r FROM private.notes_replay_attempts WHERE user_id=u AND session_id=s AND attempt_id=a;
  IF NOT FOUND THEN
   IF substr(a::text,15,1)<>'7' OR substr(a::text,20,1) NOT IN ('8','9','a','b') THEN RETURN jsonb_build_object('state','expired','serverTime',floor(extract(epoch FROM clock_timestamp())*1000)); END IF;
   embedded_ms:=('x'||substr(replace(a::text,'-',''),1,12))::bit(48)::bigint;
   IF embedded_ms<extract(epoch FROM now_at)*1000-300000 OR embedded_ms>extract(epoch FROM now_at)*1000+60000 THEN
    RETURN jsonb_build_object('state','expired','serverTime',floor(extract(epoch FROM clock_timestamp())*1000)); END IF;
  END IF;
  IF k IS NULL OR k !~ '^[a-zA-Z0-9_-]{1,32}$' OR jsonb_typeof(p_input->'fingerprints') IS DISTINCT FROM 'object'
   OR octet_length((p_input->'fingerprints')::text)>8192 THEN RAISE EXCEPTION 'Invalid fingerprint' USING ERRCODE='22023'; END IF;
  IF r.attempt_id IS NOT NULL AND (r.chat_id IS DISTINCT FROM c OR r.question_id IS DISTINCT FROM q) THEN RETURN jsonb_build_object('state','conflict'); END IF;
  fp:=p_input->'fingerprints'->>k;
  IF fp IS NULL OR fp !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid fingerprint' USING ERRCODE='22023'; END IF;
  INSERT INTO private.notes_replay_questions(user_id,session_id,chat_id,question_id) VALUES(u,s,c,q) ON CONFLICT DO NOTHING;
 END IF;
 -- All paths that need both locks take question before attempt.
 SELECT active_attempt INTO active FROM private.notes_replay_questions WHERE user_id=u AND session_id=s AND chat_id=c AND question_id=q FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','expired','serverTime',floor(extract(epoch FROM clock_timestamp())*1000)); END IF;
 SELECT * INTO r FROM private.notes_replay_attempts WHERE user_id=u AND session_id=s AND attempt_id=a FOR UPDATE;
 IF p_action='claim' AND NOT FOUND THEN
  IF active IS NOT NULL THEN
   SELECT * INTO old FROM private.notes_replay_attempts WHERE user_id=u AND session_id=s AND attempt_id=active FOR UPDATE;
   IF FOUND THEN
    IF old.fingerprint IS DISTINCT FROM (p_input->'fingerprints'->>old.key_id) THEN RETURN jsonb_build_object('state','conflict'); END IF;
    IF parent IS DISTINCT FROM active THEN
     -- An intervening client attempt may never have reached this database.
     -- Return an authenticated hint only; do not admit work or auto-retry it.
     IF parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.notes_replay_attempts WHERE user_id=u AND session_id=s AND attempt_id=parent) THEN
      RETURN jsonb_build_object('state','retry_parent_changed','retryOf',active);
     END IF;
     RETURN jsonb_build_object('state','conflict');
    END IF;
    UPDATE private.notes_replay_attempts SET state='uncertain' WHERE user_id=u AND session_id=s AND attempt_id=active AND state IN ('claimed','running');
   END IF;
  END IF;
  INSERT INTO private.notes_replay_attempts(user_id,session_id,attempt_id,chat_id,question_id,retry_of,key_id,fingerprint)
   VALUES(u,s,a,c,q,parent,k,fp) ON CONFLICT DO NOTHING RETURNING * INTO r;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','conflict'); END IF;
  UPDATE private.notes_replay_questions SET active_attempt=a WHERE user_id=u AND session_id=s AND chat_id=c AND question_id=q;
  RETURN jsonb_build_object('state','owner','ownerNonce',r.owner_nonce);
 END IF;
 IF r.attempt_id IS NULL OR r.chat_id IS DISTINCT FROM c OR r.question_id IS DISTINCT FROM q THEN RETURN jsonb_build_object('state','conflict'); END IF;
 IF r.created_at<=now_at-interval '35 days' THEN RETURN jsonb_build_object('state','expired','serverTime',floor(extract(epoch FROM clock_timestamp())*1000)); END IF;
 IF p_action='claim' THEN
  IF r.retry_of IS DISTINCT FROM parent OR r.fingerprint IS DISTINCT FROM (p_input->'fingerprints'->>r.key_id) THEN RETURN jsonb_build_object('state','conflict'); END IF;
  IF active IS DISTINCT FROM a THEN RETURN jsonb_build_object('state','superseded'); END IF;
  IF r.state='completed' THEN RETURN jsonb_build_object('state','completed','cache',CASE WHEN r.cache_until>now_at THEN r.cache ELSE NULL END); END IF;
  IF r.state='failed' THEN RETURN jsonb_build_object('state','failed','code',r.failure_code,'status',r.failure_status); END IF;
  IF r.state='uncertain' OR r.work_until<=now_at THEN RETURN jsonb_build_object('state','uncertain'); END IF;
  RETURN jsonb_build_object('state','running');
 END IF;
 IF p_action='check' THEN PERFORM private.notes_replay_live(u,s); RETURN jsonb_build_object('valid',active=a AND r.state='completed'); END IF;
 IF n IS NULL OR r.owner_nonce IS DISTINCT FROM n THEN RAISE EXCEPTION 'Owner required' USING ERRCODE='42501'; END IF;
 IF p_action='settle' THEN
  SELECT operation_id INTO op FROM private.notes_replay_stages WHERE user_id=u AND session_id=s AND attempt_id=a AND stage=p_input->>'stage';
  IF op IS NULL THEN RAISE EXCEPTION 'Unknown bound operation' USING ERRCODE='22023'; END IF;
  RETURN public.record_ai_spend(op,(p_input->>'inputTokens')::bigint,(p_input->>'outputTokens')::bigint,(p_input->>'costMicrousd')::bigint);
 END IF;
 IF active IS DISTINCT FROM a OR r.work_until<=now_at OR r.state NOT IN ('claimed','running') THEN RETURN jsonb_build_object('state','superseded'); END IF;
 IF p_action='admit' THEN
  IF r.admission IS NOT NULL THEN RETURN r.admission; END IF;
  result:=public.admit_ai_usage(u,'ask-notes',(p_input->>'dayLimit')::integer,(p_input->>'weekLimit')::integer,(p_input->>'monthLimit')::integer);
  UPDATE private.notes_replay_attempts SET admission=result,state=CASE WHEN (result->>'allowed')::boolean THEN 'running' ELSE 'failed' END,
    failure_code=CASE WHEN NOT (result->>'allowed')::boolean THEN 'AI_QUOTA_EXCEEDED' END,
    failure_status=CASE WHEN NOT (result->>'allowed')::boolean THEN 429 END WHERE user_id=u AND session_id=s AND attempt_id=a;
  RETURN result;
 END IF;
 IF p_action='fail' THEN
  IF p_input->>'code' IS NULL OR p_input->>'status' IS NULL OR p_input->>'code' NOT IN ('AI_QUOTA_EXCEEDED','AI_BUDGET_EXCEEDED','AI_TEMPORARILY_UNAVAILABLE','RETRIEVAL_NOT_READY','RETRIEVAL_UNAVAILABLE','INTERNAL_ERROR','OUTCOME_UNCERTAIN')
   OR (p_input->>'status')::integer NOT IN (409,429,500,503) THEN RAISE EXCEPTION 'Invalid failure code' USING ERRCODE='22023'; END IF;
  UPDATE private.notes_replay_attempts SET state=CASE WHEN p_input->>'code'='OUTCOME_UNCERTAIN' THEN 'uncertain' ELSE 'failed' END,
   failure_code=p_input->>'code',failure_status=(p_input->>'status')::integer WHERE user_id=u AND session_id=s AND attempt_id=a;
  RETURN jsonb_build_object('recorded',true);
 END IF;
 IF p_action='reserve' AND (r.state<>'running' OR r.admission->>'allowed' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'Admission required' USING ERRCODE='42501'; END IF;
 IF p_action='reserve' THEN
  stage_name:=p_input->>'stage';
  IF stage_name IS NULL OR stage_name NOT IN ('embedding','selection')
   OR (stage_name='embedding') IS DISTINCT FROM (p_input->>'provider'='google') THEN RAISE EXCEPTION 'Invalid stage' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM private.notes_replay_stages WHERE user_id=u AND session_id=s AND attempt_id=a AND stage=stage_name) THEN RETURN jsonb_build_object('dispatch',false); END IF;
  op:=(p_input->>'operationId')::uuid;
  result:=public.reserve_ai_spend(op,'ask-notes',p_input->>'provider',p_input->>'model',(p_input->>'reservedMicrousd')::bigint,NULL);
  IF result->>'allowed'='true' THEN
   INSERT INTO private.notes_replay_stages VALUES(u,s,a,stage_name,op,result);
  END IF;
  RETURN result||jsonb_build_object('dispatch',result->>'allowed'='true');
 END IF;
 IF p_action='finish' THEN
  bytes:=coalesce((p_input->>'cacheBytes')::integer,0);
  IF bytes NOT BETWEEN 0 AND 262144 OR octet_length((p_input->'cache')::text)>530000 THEN RAISE EXCEPTION 'Cache bound exceeded' USING ERRCODE='22023'; END IF;
  bytes:=CASE WHEN p_input->'cache' IS NOT NULL AND p_input->'cache'<>'null'::jsonb THEN octet_length((p_input->'cache')::text) ELSE 0 END;
  -- Serialize capacity decisions, skipping rows another transaction owns. Never
  -- evict an identity or wait on a second question while holding this cache lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('notes-replay-cache-capacity',0));
  SELECT coalesce(sum(cache_bytes),0),coalesce(sum(cache_bytes) FILTER(WHERE user_id=u),0)
   INTO global_bytes,account_bytes FROM private.notes_replay_attempts WHERE cache IS NOT NULL;
  IF p_input->'cache' IS NOT NULL AND p_input->'cache'<>'null'::jsonb AND bytes>0 THEN
   FOR item IN SELECT user_id,session_id,attempt_id,cache_bytes FROM private.notes_replay_attempts WHERE cache IS NOT NULL
    ORDER BY cache_until,user_id,session_id,attempt_id FOR UPDATE SKIP LOCKED LIMIT 100 LOOP
    EXIT WHEN global_bytes+bytes<=67108864 AND account_bytes+bytes<=8388608;
    IF global_bytes+bytes>67108864 OR item.user_id=u THEN
     UPDATE private.notes_replay_attempts SET cache=NULL,cache_bytes=0,cache_until=NULL
      WHERE user_id=item.user_id AND session_id=item.session_id AND attempt_id=item.attempt_id;
     global_bytes:=global_bytes-item.cache_bytes;
     IF item.user_id=u THEN account_bytes:=account_bytes-item.cache_bytes; END IF;
    END IF;
   END LOOP;
   IF global_bytes+bytes>67108864 OR account_bytes+bytes>8388608 THEN bytes:=0; END IF;
  ELSE bytes:=0; END IF;
  PERFORM private.notes_replay_live(u,s);
  UPDATE private.notes_replay_attempts SET state='completed',cache=CASE WHEN bytes>0 THEN p_input->'cache' END,
    cache_bytes=bytes,cache_until=CASE WHEN bytes>0 THEN clock_timestamp()+interval '15 minutes' END
   WHERE user_id=u AND session_id=s AND attempt_id=a AND work_until>clock_timestamp();
  RETURN jsonb_build_object('published',FOUND);
 END IF;
 RAISE EXCEPTION 'Unknown replay action' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.notes_replay(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notes_replay(text,jsonb) TO service_role;

CREATE FUNCTION private.notes_replay_prune() RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,private SET lock_timeout='500ms' SET statement_timeout='5s' AS $$
DECLARE item record;
BEGIN
 UPDATE private.notes_replay_attempts SET cache=NULL,cache_bytes=0,cache_until=NULL WHERE (user_id,session_id,attempt_id) IN (
  SELECT user_id,session_id,attempt_id FROM private.notes_replay_attempts WHERE cache_until<=clock_timestamp()
  ORDER BY cache_until LIMIT 100 FOR UPDATE SKIP LOCKED);
 FOR item IN SELECT user_id,session_id,chat_id,question_id,attempt_id FROM private.notes_replay_attempts
  WHERE created_at<clock_timestamp()-interval '35 days' ORDER BY user_id,session_id,chat_id,question_id,attempt_id LIMIT 100 LOOP
  PERFORM 1 FROM private.notes_replay_questions WHERE user_id=item.user_id AND session_id=item.session_id AND chat_id=item.chat_id AND question_id=item.question_id FOR UPDATE SKIP LOCKED;
  IF FOUND THEN
   DELETE FROM private.notes_replay_attempts WHERE user_id=item.user_id AND session_id=item.session_id AND attempt_id=item.attempt_id AND created_at<clock_timestamp()-interval '35 days';
   DELETE FROM private.notes_replay_questions r WHERE r.user_id=item.user_id AND r.session_id=item.session_id AND r.chat_id=item.chat_id AND r.question_id=item.question_id
    AND NOT EXISTS(SELECT 1 FROM private.notes_replay_attempts a WHERE a.user_id=r.user_id AND a.session_id=r.session_id AND a.chat_id=r.chat_id AND a.question_id=r.question_id);
  END IF;
 END LOOP;
 DELETE FROM private.notes_replay_questions q WHERE (q.user_id,q.session_id,q.chat_id,q.question_id) IN (
  SELECT r.user_id,r.session_id,r.chat_id,r.question_id FROM private.notes_replay_questions r
  WHERE NOT EXISTS(SELECT 1 FROM private.notes_replay_attempts a WHERE a.user_id=r.user_id AND a.session_id=r.session_id AND a.chat_id=r.chat_id AND a.question_id=r.question_id)
  ORDER BY r.user_id,r.session_id,r.chat_id,r.question_id LIMIT 100 FOR UPDATE SKIP LOCKED);
END $$;
REVOKE ALL ON FUNCTION private.notes_replay_prune() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('prune-notes-replay','*/5 * * * *','SELECT private.notes_replay_prune();');
