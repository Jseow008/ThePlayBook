-- Fail closed until an operator explicitly configures and enables a monetary ceiling.
GRANT USAGE ON SCHEMA private TO service_role;
CREATE TABLE private.ai_spend_policy (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    enabled boolean NOT NULL DEFAULT false,
    daily_limit_microusd bigint NOT NULL DEFAULT 0 CHECK (daily_limit_microusd BETWEEN 0 AND 1000000000000),
    guest_daily_limit_microusd bigint NOT NULL DEFAULT 0 CHECK (guest_daily_limit_microusd BETWEEN 0 AND 1000000000000),
    guest_daily_requests integer NOT NULL DEFAULT 5 CHECK (guest_daily_requests BETWEEN 0 AND 10000)
);
INSERT INTO private.ai_spend_policy DEFAULT VALUES;
-- Exact counters exceed bigint capacity so emergency actual-cost charges cannot
-- overflow and roll back the kill switch. Thirty digits also exceed the maximum
-- outstanding exposure: 10^12 one-microUSD reservations at 10^12 measured each.
CREATE TABLE private.ai_spend_daily_totals (
    day date PRIMARY KEY,
    charged_microusd numeric(30,0) NOT NULL CHECK (charged_microusd >= 0),
    guest_charged_microusd numeric(30,0) NOT NULL CHECK (guest_charged_microusd BETWEEN 0 AND charged_microusd)
);
CREATE TABLE private.ai_spend_guest_daily_totals (
    day date NOT NULL,
    guest_key text NOT NULL CHECK (guest_key ~ '^[0-9a-f]{64}$'),
    charged_microusd numeric(30,0) NOT NULL CHECK (charged_microusd >= 0),
    requests integer NOT NULL CHECK (requests BETWEEN 1 AND 10000),
    PRIMARY KEY (day, guest_key)
);
CREATE TABLE private.ai_spend_operations (
    operation_id uuid PRIMARY KEY,
    day date NOT NULL,
    feature text NOT NULL CHECK (feature IN ('ask-library','ask-notes','author-chat')),
    provider text NOT NULL CHECK (provider ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$'),
    model text NOT NULL CHECK (model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
    guest_key text CHECK (guest_key IS NULL OR (guest_key ~ '^[0-9a-f]{64}$' AND feature = 'author-chat')),
    reserved_microusd bigint NOT NULL CHECK (reserved_microusd BETWEEN 1 AND 100000000),
    input_tokens bigint CHECK (input_tokens BETWEEN 0 AND 1000000000),
    output_tokens bigint CHECK (output_tokens BETWEEN 0 AND 1000000000),
    cost_microusd bigint CHECK (cost_microusd BETWEEN 0 AND 1000000000000),
    CHECK ((input_tokens IS NULL AND output_tokens IS NULL AND cost_microusd IS NULL)
        OR (input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND cost_microusd IS NOT NULL))
);
CREATE INDEX ai_spend_operations_retention ON private.ai_spend_operations(day, operation_id);
CREATE INDEX ai_spend_operations_guest_retention ON private.ai_spend_operations(day, guest_key) WHERE guest_key IS NOT NULL;
ALTER TABLE private.ai_spend_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_spend_daily_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_spend_guest_daily_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_spend_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ai_spend_policy, private.ai_spend_daily_totals, private.ai_spend_guest_daily_totals, private.ai_spend_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.ai_spend_policy, private.ai_spend_daily_totals, private.ai_spend_guest_daily_totals, private.ai_spend_operations TO service_role;

CREATE FUNCTION public.reserve_ai_spend(p_operation_id uuid, p_feature text, p_provider text,
    p_model text, p_reserved_microusd bigint, p_guest_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
SET lock_timeout = '3s'
AS $$
DECLARE
    policy_row private.ai_spend_policy%ROWTYPE;
    admitted_at timestamptz;
    admission_day date;
    retry_ms bigint;
    total numeric;
    guest_total numeric;
    guest_requests integer;
    operation_ms bigint;
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'AI spending requires read committed isolation' USING ERRCODE = '25001';
    END IF;
    p_guest_key := lower(p_guest_key);
    IF p_operation_id IS NULL OR p_feature IS NULL OR p_feature NOT IN ('ask-library','ask-notes','author-chat')
       OR p_provider IS NULL OR p_provider !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$'
       OR p_model IS NULL OR p_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
       OR p_reserved_microusd IS NULL OR p_reserved_microusd NOT BETWEEN 1 AND 100000000
       OR (p_guest_key IS NOT NULL AND (p_guest_key !~ '^[0-9a-f]{64}$' OR p_feature <> 'author-chat')) THEN
        RAISE EXCEPTION 'Invalid AI spending reservation' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO STRICT policy_row FROM private.ai_spend_policy WHERE singleton FOR UPDATE;
    admitted_at := clock_timestamp(); -- Read after lock; queued requests can cross midnight.
    --v7 timestamp closes replay after bounded operational retention.
    IF p_operation_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Operation must be a fresh UUIDv7' USING ERRCODE = '22023';
    END IF;
    operation_ms := ('x' || left(replace(p_operation_id::text, '-', ''), 12))::bit(48)::bigint;
    IF operation_ms < floor(extract(epoch FROM admitted_at) * 1000) - 600000
       OR operation_ms > floor(extract(epoch FROM admitted_at) * 1000) + 30000 THEN
        RAISE EXCEPTION 'Operation timestamp outside admission window' USING ERRCODE = '22023';
    END IF;
    admission_day := (admitted_at AT TIME ZONE 'UTC')::date;
    retry_ms := greatest(1, ceil(extract(epoch FROM (((admission_day + 1)::timestamp AT TIME ZONE 'UTC') - admitted_at)) * 1000)::bigint);
    IF EXISTS (SELECT 1 FROM private.ai_spend_operations WHERE operation_id = p_operation_id) THEN
        RAISE EXCEPTION 'Operation already admitted' USING ERRCODE = '22023';
    END IF;
    IF NOT policy_row.enabled THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'disabled', 'retryAfterMs', retry_ms);
    END IF;
    SELECT charged_microusd,guest_charged_microusd INTO total,guest_total FROM private.ai_spend_daily_totals WHERE day = admission_day;
    IF p_reserved_microusd > policy_row.daily_limit_microusd - coalesce(total, 0) THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'global_budget', 'retryAfterMs', retry_ms);
    END IF;
    IF p_guest_key IS NOT NULL THEN
        SELECT requests INTO guest_requests
        FROM private.ai_spend_guest_daily_totals WHERE day = admission_day AND guest_key = p_guest_key;
        IF coalesce(guest_requests, 0) >= policy_row.guest_daily_requests THEN
            RETURN jsonb_build_object('allowed', false, 'reason', 'guest_quota', 'retryAfterMs', retry_ms);
        END IF;
        IF p_reserved_microusd > policy_row.guest_daily_limit_microusd - coalesce(guest_total, 0) THEN
            RETURN jsonb_build_object('allowed', false, 'reason', 'guest_budget', 'retryAfterMs', retry_ms);
        END IF;
    END IF;
    INSERT INTO private.ai_spend_operations(operation_id,day,feature,provider,model,guest_key,reserved_microusd)
    VALUES (p_operation_id,admission_day,p_feature,p_provider,p_model,p_guest_key,p_reserved_microusd);
    INSERT INTO private.ai_spend_daily_totals VALUES (admission_day,p_reserved_microusd,CASE WHEN p_guest_key IS NULL THEN 0 ELSE p_reserved_microusd END)
    ON CONFLICT (day) DO UPDATE SET charged_microusd = ai_spend_daily_totals.charged_microusd + excluded.charged_microusd,
        guest_charged_microusd = ai_spend_daily_totals.guest_charged_microusd + excluded.guest_charged_microusd;
    IF p_guest_key IS NOT NULL THEN
        INSERT INTO private.ai_spend_guest_daily_totals VALUES (admission_day,p_guest_key,p_reserved_microusd,1)
        ON CONFLICT (day,guest_key) DO UPDATE SET charged_microusd = ai_spend_guest_daily_totals.charged_microusd + excluded.charged_microusd,
            requests = ai_spend_guest_daily_totals.requests + 1;
    END IF;
    RETURN jsonb_build_object('allowed',true,'operationId',p_operation_id,'reservedMicrousd',p_reserved_microusd);
END;
$$;

CREATE FUNCTION public.record_ai_spend(p_operation_id uuid,p_input_tokens bigint,p_output_tokens bigint,p_cost_microusd bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
SET lock_timeout = '3s'
AS $$
DECLARE
    operation private.ai_spend_operations%ROWTYPE;
    refund bigint;
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'AI spending requires read committed isolation' USING ERRCODE = '25001';
    END IF;
    IF p_operation_id IS NULL OR p_input_tokens IS NULL OR p_output_tokens IS NULL OR p_cost_microusd IS NULL
       OR p_input_tokens NOT BETWEEN 0 AND 1000000000 OR p_output_tokens NOT BETWEEN 0 AND 1000000000
       OR p_cost_microusd NOT BETWEEN 0 AND 1000000000000 THEN
        RAISE EXCEPTION 'Invalid AI spending measurement' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM private.ai_spend_policy WHERE singleton FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AI spending policy missing'; END IF;
    SELECT * INTO operation FROM private.ai_spend_operations WHERE operation_id = p_operation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown AI operation' USING ERRCODE = '22023'; END IF;
    IF operation.cost_microusd IS NOT NULL THEN
        IF operation.cost_microusd <> p_cost_microusd OR operation.input_tokens <> p_input_tokens OR operation.output_tokens <> p_output_tokens THEN
            RAISE EXCEPTION 'Conflicting AI spending measurement' USING ERRCODE = '22023';
        END IF;
    ELSE
        UPDATE private.ai_spend_operations SET input_tokens = p_input_tokens,output_tokens = p_output_tokens,cost_microusd = p_cost_microusd
        WHERE operation_id = p_operation_id;
        -- A negative refund charges overspend exactly once, including guest
        -- totals, before disabling. Re-enabling cannot forget measured costs.
        refund := operation.reserved_microusd - p_cost_microusd;
        UPDATE private.ai_spend_daily_totals SET charged_microusd = charged_microusd - refund,
            guest_charged_microusd = guest_charged_microusd - CASE WHEN operation.guest_key IS NULL THEN 0 ELSE refund END
        WHERE day = operation.day;
        IF NOT FOUND THEN RAISE EXCEPTION 'Missing AI daily accounting'; END IF;
        IF operation.guest_key IS NOT NULL THEN
            UPDATE private.ai_spend_guest_daily_totals SET charged_microusd = charged_microusd - refund
            WHERE day = operation.day AND guest_key = operation.guest_key;
            IF NOT FOUND THEN RAISE EXCEPTION 'Missing AI guest accounting'; END IF;
        END IF;
    END IF;
    IF p_cost_microusd > operation.reserved_microusd THEN
        -- Return, do not raise: emergency disable and measured usage must commit.
        UPDATE private.ai_spend_policy SET enabled = false WHERE singleton;
        RETURN jsonb_build_object('recorded',false,'reason','reservation_exceeded');
    END IF;
    RETURN jsonb_build_object('recorded',true);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_spend(uuid,text,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_ai_spend(uuid,bigint,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_spend(uuid,text,text,text,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_spend(uuid,bigint,bigint,bigint) TO service_role;

-- Bounded hourly cleanup; old abandoned calls retain their full charge in daily
-- aggregates. Timestamp validation prevents replay after operational pruning.
-- Current/prior-day reservations cannot be removed.
CREATE FUNCTION private.ai_spend_prune_old_spend()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
SET lock_timeout = '3s'
SET statement_timeout = '10s'
AS $$
DECLARE cutoff date;
BEGIN
    PERFORM 1 FROM private.ai_spend_policy WHERE singleton FOR UPDATE;
    cutoff := (clock_timestamp() AT TIME ZONE 'UTC')::date - 35;
    DELETE FROM private.ai_spend_operations WHERE operation_id IN (
        SELECT operation_id FROM private.ai_spend_operations WHERE day < cutoff ORDER BY day, operation_id LIMIT 10000
    );
    DELETE FROM private.ai_spend_guest_daily_totals WHERE (day,guest_key) IN (
        SELECT g.day,g.guest_key FROM private.ai_spend_guest_daily_totals g WHERE g.day < cutoff
        AND NOT EXISTS (SELECT 1 FROM private.ai_spend_operations o WHERE o.day = g.day AND o.guest_key = g.guest_key)
        ORDER BY g.day,g.guest_key LIMIT 10000
    );
END;
$$;
REVOKE ALL ON FUNCTION private.ai_spend_prune_old_spend() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('prune-ai-spend','37 * * * *','SELECT private.ai_spend_prune_old_spend();');
