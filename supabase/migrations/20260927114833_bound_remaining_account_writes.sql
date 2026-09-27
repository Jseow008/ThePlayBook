-- Existing deployed server consumers use service_role or SECURITY DEFINER
-- helpers. Browser reads remain unchanged; redundant direct mutations are closed.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.content_request_votes, public.reading_activity, public.ai_message_usage FROM PUBLIC, anon, authenticated;

-- Restore the narrow invoker-RPC grant removed by the historical baseline replay.
-- No role, internal flag or reader-settings column grant is added.
GRANT UPDATE (onboarding_state) ON public.profiles TO authenticated;

CREATE TABLE private.account_write_budget (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 collection text NOT NULL CHECK (collection IN ('content_feedback','user_notification_preferences','profiles')),
 window_started_at timestamptz NOT NULL,
 writes integer NOT NULL CHECK (writes BETWEEN 1 AND 30),
 PRIMARY KEY(user_id,collection)
);
ALTER TABLE private.account_write_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.account_write_budget FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.admit_account_write(p_collection text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE actor uuid:=auth.uid(); at_time timestamptz; budget private.account_write_budget%ROWTYPE;
 ceiling integer:=CASE p_collection WHEN 'content_feedback' THEN 20 WHEN 'user_notification_preferences' THEN 20 WHEN 'profiles' THEN 30 END;
BEGIN
 IF actor IS NULL OR ceiling IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
  RAISE EXCEPTION 'Authenticated account scope required' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-write:'||actor::text||':'||p_collection,0));
 at_time:=pg_catalog.clock_timestamp();
 SELECT * INTO budget FROM private.account_write_budget WHERE user_id=actor AND collection=p_collection;
 IF FOUND AND budget.window_started_at>at_time-interval '60 seconds' THEN
  IF budget.writes>=ceiling THEN RAISE EXCEPTION 'Too many account changes. Retry shortly.' USING ERRCODE='PT429'; END IF;
  UPDATE private.account_write_budget SET writes=writes+1 WHERE user_id=actor AND collection=p_collection;
 ELSE
  INSERT INTO private.account_write_budget VALUES(actor,p_collection,at_time,1)
  ON CONFLICT(user_id,collection) DO UPDATE SET window_started_at=EXCLUDED.window_started_at,writes=1;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION private.admit_account_write(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.guard_account_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE actor uuid; entry record;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='profiles' THEN actor:=NEW.id; ELSE actor:=NEW.user_id; END IF;
 IF actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Account owner mismatch' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='content_feedback' THEN
  IF coalesce(char_length(NEW.reason),0)>256 OR coalesce(char_length(NEW.details),0)>4000 THEN
   RAISE EXCEPTION 'Feedback text exceeds bounds' USING ERRCODE='22001';
  END IF;
 ELSIF TG_TABLE_NAME='user_notification_preferences' THEN
  IF char_length(NEW.unsubscribe_token)>256 THEN RAISE EXCEPTION 'Notification token exceeds bounds' USING ERRCODE='22001'; END IF;
 ELSIF TG_TABLE_NAME='profiles' THEN
  IF jsonb_typeof(NEW.onboarding_state) IS DISTINCT FROM 'object' OR octet_length(NEW.onboarding_state::text)>32768 THEN
   RAISE EXCEPTION 'Invalid onboarding state' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_each(NEW.onboarding_state))>32 THEN
   RAISE EXCEPTION 'Too many onboarding entries' USING ERRCODE='22023';
  END IF;
  FOR entry IN SELECT key,value FROM jsonb_each(NEW.onboarding_state) LOOP
   IF jsonb_typeof(entry.value) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid onboarding entry' USING ERRCODE='22023'; END IF;
   IF entry.key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    OR (SELECT count(*) FROM jsonb_object_keys(entry.value))<>3
    OR jsonb_typeof(entry.value->'version') IS DISTINCT FROM 'string'
    OR (entry.value->>'version') !~ '^[A-Za-z0-9._-]{1,32}$'
    OR jsonb_typeof(entry.value->'status') IS DISTINCT FROM 'string'
    OR (entry.value->>'status') NOT IN ('dismissed','completed')
    OR jsonb_typeof(entry.value->'updated_at') IS DISTINCT FROM 'string'
    OR char_length(entry.value->>'updated_at') NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'Invalid onboarding entry' USING ERRCODE='22023';
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.guard_account_write() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.charge_account_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role()='authenticated' THEN PERFORM private.admit_account_write(TG_TABLE_NAME); END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.charge_account_write() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.guard_account_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role()='authenticated' THEN PERFORM private.admit_account_write(TG_TABLE_NAME); END IF;
 RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION private.guard_account_delete() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER guard_feedback_write BEFORE INSERT OR UPDATE ON public.content_feedback FOR EACH ROW EXECUTE FUNCTION private.guard_account_write();
CREATE TRIGGER charge_feedback_write AFTER INSERT OR UPDATE ON public.content_feedback FOR EACH ROW EXECUTE FUNCTION private.charge_account_write();
CREATE TRIGGER guard_feedback_delete BEFORE DELETE ON public.content_feedback FOR EACH STATEMENT EXECUTE FUNCTION private.guard_account_delete();
CREATE TRIGGER guard_preferences_write BEFORE INSERT OR UPDATE ON public.user_notification_preferences FOR EACH ROW EXECUTE FUNCTION private.guard_account_write();
CREATE TRIGGER charge_preferences_write AFTER INSERT OR UPDATE ON public.user_notification_preferences FOR EACH ROW EXECUTE FUNCTION private.charge_account_write();
CREATE TRIGGER guard_preferences_delete BEFORE DELETE ON public.user_notification_preferences FOR EACH STATEMENT EXECUTE FUNCTION private.guard_account_delete();
CREATE TRIGGER guard_onboarding_write BEFORE UPDATE OF onboarding_state ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.guard_account_write();
CREATE TRIGGER charge_onboarding_write AFTER UPDATE OF onboarding_state ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.charge_account_write();
