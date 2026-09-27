-- Additive rollout: old builds may still insert usage directly until drained.
-- Serialize those writes with admission without changing their existing RLS.
CREATE FUNCTION private.lock_ai_usage_account() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-quota:' || NEW.user_id::text, 0));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.lock_ai_usage_account() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lock_ai_usage_account BEFORE INSERT ON public.ai_message_usage
FOR EACH ROW EXECUTE FUNCTION private.lock_ai_usage_account();

-- Only trusted server code supplies identity and limits. No browser RPC grant.
CREATE FUNCTION public.admit_ai_usage(
  p_user_id uuid, p_feature text, p_day_limit integer, p_week_limit integer, p_month_limit integer
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = '' SET lock_timeout = '3s'
AS $$
DECLARE
  admission_time timestamptz;
  starts timestamptz[];
  resets timestamptz[];
  counts bigint[];
  limits integer[] := ARRAY[p_day_limit, p_week_limit, p_month_limit];
  names text[] := ARRAY['day', 'week', 'month'];
  states jsonb := '[]'::jsonb;
  blocked integer;
  idx integer;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  -- A transaction started before a competing admission must see its commit.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Read committed isolation required' USING ERRCODE = '25001';
  END IF;
  IF p_user_id IS NULL OR p_feature IS NULL OR p_feature NOT IN ('ask-library', 'ask-notes', 'author-chat')
    OR p_day_limit IS NULL OR p_week_limit IS NULL OR p_month_limit IS NULL
    OR p_day_limit < 1 OR p_week_limit < 1 OR p_month_limit < 1 THEN
    RAISE EXCEPTION 'Invalid AI admission parameters' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-quota:' || p_user_id::text, 0));
  -- Read the database clock after waiting, so a midnight waiter uses the new windows.
  admission_time := pg_catalog.clock_timestamp();
  starts := ARRAY[
    date_trunc('day', admission_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
    date_trunc('week', admission_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
    date_trunc('month', admission_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  ];
  resets := ARRAY[
    ((starts[1] AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC',
    ((starts[2] AT TIME ZONE 'UTC') + interval '7 days') AT TIME ZONE 'UTC',
    ((starts[3] AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'
  ];
  SELECT ARRAY[
    count(*) FILTER (WHERE created_at >= starts[1]),
    count(*) FILTER (WHERE created_at >= starts[2]),
    count(*) FILTER (WHERE created_at >= starts[3])
  ] INTO counts FROM public.ai_message_usage
  WHERE user_id = p_user_id AND created_at >= LEAST(starts[1], starts[2], starts[3]);
  FOR idx IN 1..3 LOOP
    states := states || jsonb_build_array(jsonb_build_object(
      'window', names[idx], 'limit', limits[idx], 'used', counts[idx],
      'remaining', GREATEST(0, limits[idx] - counts[idx]), 'resetAt', resets[idx]
    ));
    IF blocked IS NULL AND counts[idx] >= limits[idx] THEN blocked := idx; END IF;
  END LOOP;
  IF blocked IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', false, 'windows', states,
      'blockedWindow', names[blocked], 'limit', limits[blocked], 'used', counts[blocked],
      'resetAt', resets[blocked],
      'retryAfterMs', GREATEST(0, ceil(extract(epoch FROM (resets[blocked] - admission_time)) * 1000)));
  END IF;
  INSERT INTO public.ai_message_usage (user_id, feature, created_at)
  VALUES (p_user_id, p_feature, admission_time);
  RETURN jsonb_build_object('allowed', true, 'windows', states);
END;
$$;
REVOKE ALL ON FUNCTION public.admit_ai_usage(uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_ai_usage(uuid, text, integer, integer, integer) TO service_role;
