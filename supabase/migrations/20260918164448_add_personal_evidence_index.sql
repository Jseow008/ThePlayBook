-- Personal capture vectors are durable derived data. No personal text is copied
-- into the index or job state; captures remain the authority for scope/freshness.
SET lock_timeout = '5s';
SET statement_timeout = '120s';

CREATE TABLE private.personal_evidence_index (
    evidence_type text NOT NULL CHECK (evidence_type IN ('highlight', 'reflection')),
    evidence_id uuid NOT NULL,
    highlight_id uuid UNIQUE REFERENCES public.user_highlights(id) ON DELETE CASCADE,
    reflection_id uuid UNIQUE REFERENCES public.user_reflections(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    revision uuid NOT NULL DEFAULT gen_random_uuid(),
    index_version text NOT NULL DEFAULT 'gemini-embedding-001:768:personal-v1'
        CHECK (index_version = 'gemini-embedding-001:768:personal-v1'),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'ready', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    lease_token uuid,
    lease_expires_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (evidence_type, evidence_id),
    CHECK ((evidence_type = 'highlight' AND highlight_id IS NOT NULL AND highlight_id = evidence_id AND reflection_id IS NULL)
        OR (evidence_type = 'reflection' AND reflection_id IS NOT NULL AND reflection_id = evidence_id AND highlight_id IS NULL)),
    CHECK ((state = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (state <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX personal_evidence_index_owner_idx ON private.personal_evidence_index(user_id, evidence_type, evidence_id);
CREATE INDEX personal_evidence_index_pending_idx ON private.personal_evidence_index(next_attempt_at, evidence_type, evidence_id)
    WHERE state IN ('pending', 'processing');

CREATE TABLE private.personal_evidence_chunk (
    evidence_type text NOT NULL,
    evidence_id uuid NOT NULL,
    revision uuid NOT NULL,
    field text NOT NULL,
    chunk_index integer NOT NULL CHECK (chunk_index >= 0),
    start_offset integer NOT NULL CHECK (start_offset >= 0),
    end_offset integer NOT NULL CHECK (end_offset > start_offset),
    embedding extensions.vector(768) NOT NULL,
    PRIMARY KEY (evidence_type, evidence_id, field, chunk_index),
    FOREIGN KEY (evidence_type, evidence_id) REFERENCES private.personal_evidence_index(evidence_type, evidence_id) ON DELETE CASCADE,
    CHECK ((evidence_type = 'highlight' AND field IN ('highlightedText', 'noteBody'))
        OR (evidence_type = 'reflection' AND field IN ('prompt', 'reflectionText')))
);
ALTER TABLE private.personal_evidence_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.personal_evidence_index FORCE ROW LEVEL SECURITY;
ALTER TABLE private.personal_evidence_chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.personal_evidence_chunk FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.personal_evidence_index, private.personal_evidence_chunk FROM PUBLIC, anon, authenticated, service_role;

-- Provider cooldown outlives every individual capture, including deletion/edit.
CREATE TABLE private.personal_evidence_provider_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    next_allowed_at timestamptz NOT NULL DEFAULT '-infinity',
    worker_token uuid,
    worker_expires_at timestamptz,
    CONSTRAINT personal_evidence_provider_worker_lease CHECK ((worker_token IS NULL AND worker_expires_at IS NULL)
        OR (worker_token IS NOT NULL AND worker_expires_at IS NOT NULL))
);
INSERT INTO private.personal_evidence_provider_state(singleton) VALUES (true);
ALTER TABLE private.personal_evidence_provider_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.personal_evidence_provider_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.personal_evidence_provider_state FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.invalidate_personal_evidence_index()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_type text := CASE WHEN TG_TABLE_NAME = 'user_highlights' THEN 'highlight' ELSE 'reflection' END;
    v_new jsonb := to_jsonb(NEW);
    v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       AND v_new->'highlighted_text' IS NOT DISTINCT FROM v_old->'highlighted_text'
       AND v_new->'note_body' IS NOT DISTINCT FROM v_old->'note_body'
       AND v_new->'prompt' IS NOT DISTINCT FROM v_old->'prompt'
       AND v_new->'reflection_text' IS NOT DISTINCT FROM v_old->'reflection_text' THEN
        RETURN NEW;
    END IF;
    INSERT INTO private.personal_evidence_index(evidence_type, evidence_id, highlight_id, reflection_id, user_id)
    VALUES (v_type, NEW.id, CASE WHEN v_type = 'highlight' THEN NEW.id END,
        CASE WHEN v_type = 'reflection' THEN NEW.id END, NEW.user_id)
    ON CONFLICT (evidence_type, evidence_id) DO UPDATE SET
        user_id = EXCLUDED.user_id, revision = gen_random_uuid(), state = 'pending',
        attempts = 0, next_attempt_at = now(), lease_token = NULL, lease_expires_at = NULL, updated_at = now();
    DELETE FROM private.personal_evidence_chunk WHERE evidence_type = v_type AND evidence_id = NEW.id;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.invalidate_personal_evidence_index() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER personal_highlight_index_invalidation
    AFTER INSERT OR UPDATE OF highlighted_text, note_body, user_id ON public.user_highlights
    FOR EACH ROW EXECUTE FUNCTION private.invalidate_personal_evidence_index();
CREATE TRIGGER personal_reflection_index_invalidation
    AFTER INSERT OR UPDATE OF prompt, reflection_text, user_id ON public.user_reflections
    FOR EACH ROW EXECUTE FUNCTION private.invalidate_personal_evidence_index();

-- All worker entry points require both an explicit service-role grant and its
-- signed request role. They cannot be used as ordinary-account mutation RPCs.
CREATE FUNCTION private.require_personal_index_service()
RETURNS void LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
    IF (SELECT auth.jwt()->>'role') IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'personal index worker requires service role' USING ERRCODE = '42501';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.require_personal_index_service() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.seed_personal_evidence_index(p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
    PERFORM private.require_personal_index_service();
    WITH missing AS (
        SELECT 'highlight'::text AS evidence_type, h.id, h.user_id FROM public.user_highlights h
        WHERE NOT EXISTS (SELECT 1 FROM private.personal_evidence_index i WHERE i.evidence_type = 'highlight' AND i.evidence_id = h.id)
        UNION ALL
        SELECT 'reflection', r.id, r.user_id FROM public.user_reflections r
        WHERE NOT EXISTS (SELECT 1 FROM private.personal_evidence_index i WHERE i.evidence_type = 'reflection' AND i.evidence_id = r.id)
    )
    INSERT INTO private.personal_evidence_index(evidence_type, evidence_id, highlight_id, reflection_id, user_id)
    SELECT evidence_type, id, CASE WHEN evidence_type = 'highlight' THEN id END,
        CASE WHEN evidence_type = 'reflection' THEN id END, user_id
    FROM missing ORDER BY evidence_type, id LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500)
    ON CONFLICT (evidence_type, evidence_id) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('seeded_records', v_count);
END;
$$;

-- This invocation lease survives capture edits/deletes while a provider request
-- is still in flight. Capture leases alone cannot enforce global admission.
CREATE FUNCTION private.acquire_personal_evidence_worker(p_lease_seconds integer DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_lease jsonb;
BEGIN
    PERFORM private.require_personal_index_service();
    IF NOT pg_try_advisory_xact_lock(91008, 1) THEN RETURN NULL; END IF;
    UPDATE private.personal_evidence_provider_state
    SET worker_token = gen_random_uuid(),
        worker_expires_at = clock_timestamp() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds,90),60),90))
    WHERE singleton AND next_allowed_at <= clock_timestamp()
        AND (worker_expires_at IS NULL OR worker_expires_at <= clock_timestamp())
    RETURNING jsonb_build_object('worker_token',worker_token,'worker_expires_at',worker_expires_at) INTO v_lease;
    RETURN v_lease;
END;
$$;

CREATE FUNCTION private.release_personal_evidence_worker(p_worker_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
    PERFORM private.require_personal_index_service();
    PERFORM pg_advisory_xact_lock(91008, 1);
    UPDATE private.personal_evidence_provider_state SET worker_token = NULL,worker_expires_at = NULL
    WHERE singleton AND worker_token = p_worker_token;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count = 1;
END;
$$;

CREATE FUNCTION private.claim_personal_evidence_index(p_worker_token uuid, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_claims jsonb; v_worker_expires_at timestamptz;
BEGIN
    PERFORM private.require_personal_index_service();
    -- The transaction lock serializes admission; the persisted leases retain
    -- that exclusion while the worker releases its DB transaction for the API call.
    IF NOT pg_try_advisory_xact_lock(91008, 1) THEN RETURN '[]'::jsonb; END IF;
    SELECT worker_expires_at INTO v_worker_expires_at FROM private.personal_evidence_provider_state
    WHERE singleton AND worker_token = p_worker_token AND worker_expires_at > clock_timestamp()
        AND next_allowed_at <= clock_timestamp();
    IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
    IF EXISTS (SELECT 1 FROM private.personal_evidence_index WHERE state = 'processing' AND lease_expires_at > clock_timestamp()) THEN
        RETURN '[]'::jsonb;
    END IF;
    UPDATE private.personal_evidence_index SET state = 'failed', lease_token = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE state = 'processing' AND lease_expires_at <= clock_timestamp() AND attempts >= 5;
    WITH selected AS (
        SELECT evidence_type, evidence_id FROM private.personal_evidence_index
        WHERE attempts < 5 AND ((state = 'pending' AND next_attempt_at <= clock_timestamp())
            OR (state = 'processing' AND lease_expires_at <= clock_timestamp()))
        ORDER BY next_attempt_at, evidence_type, evidence_id
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 10) FOR UPDATE SKIP LOCKED
    ), claimed AS (
        UPDATE private.personal_evidence_index i SET state = 'processing', attempts = i.attempts + 1,
            lease_token = gen_random_uuid(), lease_expires_at = LEAST(v_worker_expires_at,
                clock_timestamp() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 90), 10), 90))),
            updated_at = now()
        FROM selected s WHERE i.evidence_type = s.evidence_type AND i.evidence_id = s.evidence_id RETURNING i.*
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'evidence_type', c.evidence_type, 'evidence_id', c.evidence_id, 'user_id', c.user_id,
        'revision', c.revision, 'index_version', c.index_version, 'lease_token', c.lease_token,
        'lease_expires_at', c.lease_expires_at, 'attempts', c.attempts,
        'highlighted_text', h.highlighted_text, 'note_body', h.note_body,
        'prompt', r.prompt, 'reflection_text', r.reflection_text
    ) ORDER BY c.evidence_type, c.evidence_id), '[]'::jsonb) INTO v_claims
    FROM claimed c
    LEFT JOIN public.user_highlights h ON c.highlight_id = h.id AND h.user_id = c.user_id
    LEFT JOIN public.user_reflections r ON c.reflection_id = r.id AND r.user_id = c.user_id;
    RETURN v_claims;
END;
$$;

-- JavaScript offsets count supplementary Unicode characters as two UTF-16 units.
CREATE FUNCTION private.personal_evidence_utf16_length(p_text text)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
    SELECT COALESCE(sum(CASE WHEN octet_length(point) > 3 THEN 2 ELSE 1 END), 0)::integer
    FROM regexp_split_to_table(p_text, '') AS point;
$$;
REVOKE ALL ON FUNCTION private.personal_evidence_utf16_length(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.complete_personal_evidence_index(
    p_evidence_type text, p_evidence_id uuid, p_revision uuid, p_lease_token uuid, p_chunks jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_state private.personal_evidence_index%ROWTYPE;
    v_fields jsonb;
    v_field record;
    v_length integer;
    v_count integer;
BEGIN
    PERFORM private.require_personal_index_service();
    -- Lock source before index, matching the capture trigger's lock order.
    IF p_evidence_type = 'highlight' THEN
        SELECT jsonb_build_object('highlightedText', highlighted_text, 'noteBody', note_body) INTO v_fields
        FROM public.user_highlights WHERE id = p_evidence_id FOR UPDATE;
    ELSIF p_evidence_type = 'reflection' THEN
        SELECT jsonb_build_object('prompt', prompt, 'reflectionText', reflection_text) INTO v_fields
        FROM public.user_reflections WHERE id = p_evidence_id FOR UPDATE;
    ELSE RETURN false;
    END IF;
    IF v_fields IS NULL THEN RETURN false; END IF;
    SELECT * INTO v_state FROM private.personal_evidence_index
    WHERE evidence_type = p_evidence_type AND evidence_id = p_evidence_id FOR UPDATE;
    IF NOT FOUND OR v_state.state <> 'processing' OR v_state.revision IS DISTINCT FROM p_revision
       OR v_state.lease_token IS DISTINCT FROM p_lease_token OR v_state.lease_expires_at <= clock_timestamp() THEN
        RETURN false;
    END IF;
    IF jsonb_typeof(p_chunks) IS DISTINCT FROM 'array' OR jsonb_array_length(p_chunks) > 64 THEN
        RAISE EXCEPTION 'invalid personal index chunks' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_chunks) c
        WHERE jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT (v_fields ? (c->>'field'))
        OR jsonb_typeof(c->'embedding') IS DISTINCT FROM 'array'
        OR jsonb_typeof(c->'chunk_index') IS DISTINCT FROM 'number'
        OR jsonb_typeof(c->'start_offset') IS DISTINCT FROM 'number'
        OR jsonb_typeof(c->'end_offset') IS DISTINCT FROM 'number') THEN
        RAISE EXCEPTION 'invalid personal index chunk fields' USING ERRCODE = '22023';
    END IF;
    -- A ready record must cover every nonblank field, not merely its first chunk.
    FOR v_field IN SELECT key, value FROM jsonb_each_text(v_fields) LOOP
        v_length := private.personal_evidence_utf16_length(COALESCE(v_field.value, ''));
        SELECT count(*) INTO v_count FROM jsonb_array_elements(p_chunks) c WHERE c->>'field' = v_field.key;
        IF COALESCE(v_field.value, '') ~ '^\s*$' THEN
            IF v_count <> 0 THEN RAISE EXCEPTION 'unexpected blank-field chunks' USING ERRCODE = '22023'; END IF;
            CONTINUE;
        END IF;
        IF v_count = 0 OR EXISTS (
            SELECT 1 FROM (
                SELECT (c->>'chunk_index')::integer AS n, (c->>'start_offset')::integer AS start_at,
                    (c->>'end_offset')::integer AS end_at,
                    row_number() OVER (ORDER BY (c->>'chunk_index')::integer) - 1 AS expected_n,
                    lag((c->>'end_offset')::integer) OVER (ORDER BY (c->>'chunk_index')::integer) AS previous_end,
                    lag((c->>'start_offset')::integer) OVER (ORDER BY (c->>'chunk_index')::integer) AS previous_start
                FROM jsonb_array_elements(p_chunks) c WHERE c->>'field' = v_field.key
            ) spans WHERE n <> expected_n OR start_at < 0 OR end_at <= start_at OR end_at > v_length
                OR (n = 0 AND start_at <> 0) OR (n > 0 AND (start_at > previous_end OR start_at <= previous_start OR end_at <= previous_end))
                OR (n = v_count - 1 AND end_at <> v_length)
        ) THEN RAISE EXCEPTION 'incomplete personal index field coverage' USING ERRCODE = '22023'; END IF;
    END LOOP;
    DELETE FROM private.personal_evidence_chunk WHERE evidence_type = p_evidence_type AND evidence_id = p_evidence_id;
    INSERT INTO private.personal_evidence_chunk(evidence_type, evidence_id, revision, field, chunk_index, start_offset, end_offset, embedding)
    SELECT p_evidence_type, p_evidence_id, p_revision, c->>'field', (c->>'chunk_index')::integer,
        (c->>'start_offset')::integer, (c->>'end_offset')::integer, (c->'embedding')::text::extensions.vector(768)
    FROM jsonb_array_elements(p_chunks) c;
    IF EXISTS (SELECT 1 FROM private.personal_evidence_chunk WHERE evidence_type = p_evidence_type AND evidence_id = p_evidence_id
        AND extensions.vector_norm(embedding) = 0) THEN
        RAISE EXCEPTION 'invalid zero personal embedding' USING ERRCODE = '22023';
    END IF;
    -- The provider may have finished just as the lease expired. Do not publish it.
    IF v_state.lease_expires_at <= clock_timestamp() THEN
        RAISE EXCEPTION 'personal index lease expired during completion' USING ERRCODE = '40001';
    END IF;
    UPDATE private.personal_evidence_index SET state = 'ready', lease_token = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE evidence_type = p_evidence_type AND evidence_id = p_evidence_id;
    RETURN true;
END;
$$;

CREATE FUNCTION private.fail_personal_evidence_index(
    p_evidence_type text, p_evidence_id uuid, p_revision uuid, p_lease_token uuid,
    p_retry_after_seconds integer DEFAULT 60, p_terminal boolean DEFAULT false, p_rate_limited boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
    PERFORM private.require_personal_index_service();
    PERFORM pg_advisory_xact_lock(91008, 1);
    UPDATE private.personal_evidence_index SET state = CASE WHEN p_terminal OR (NOT p_rate_limited AND attempts >= 5) THEN 'failed' ELSE 'pending' END,
        attempts = CASE WHEN p_rate_limited THEN GREATEST(attempts - 1, 0) ELSE attempts END,
        next_attempt_at = clock_timestamp() + make_interval(secs => LEAST(GREATEST(COALESCE(p_retry_after_seconds, 60), 1), 604800)),
        lease_token = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE evidence_type = p_evidence_type AND evidence_id = p_evidence_id AND revision = p_revision
        AND lease_token = p_lease_token AND state = 'processing' AND lease_expires_at > clock_timestamp();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF NOT p_terminal THEN
        UPDATE private.personal_evidence_provider_state
        SET next_allowed_at = GREATEST(next_allowed_at, clock_timestamp() + make_interval(secs => LEAST(GREATEST(COALESCE(p_retry_after_seconds, 60), 1), 604800)))
        WHERE singleton;
    END IF;
    RETURN v_count = 1;
END;
$$;

-- Scope membership always comes from live owned captures. Current source context
-- is optional; withdrawal must not remove the user's retained personal text.
CREATE FUNCTION private.personal_evidence_scope(p_scope jsonb)
RETURNS TABLE(evidence_type text, evidence_id uuid, user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user uuid := (SELECT auth.uid());
    v_session text := (SELECT auth.jwt()->>'session_id');
    v_type text;
    v_content uuid;
    v_color text;
    v_query text;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
    IF v_session IS NULL OR v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'active session required' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = v_session::uuid AND s.user_id = v_user
        AND (s.not_after IS NULL OR s.not_after > now())) THEN
        RAISE EXCEPTION 'active session required' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_scope) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid personal evidence scope' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_scope) key WHERE key NOT IN ('version','itemType','contentItemId','color','filterQuery'))
        OR p_scope->'version' IS DISTINCT FROM '1'::jsonb
        OR COALESCE(p_scope->>'itemType','') NOT IN ('all','highlight','note','reflection')
        OR (p_scope ? 'contentItemId' AND jsonb_typeof(p_scope->'contentItemId') IS DISTINCT FROM 'string')
        OR (p_scope ? 'color' AND COALESCE(p_scope->>'color','') NOT IN ('yellow','blue','green','pink','purple','red'))
        OR (p_scope ? 'filterQuery' AND jsonb_typeof(p_scope->'filterQuery') IS DISTINCT FROM 'string') THEN
        RAISE EXCEPTION 'invalid personal evidence scope' USING ERRCODE = '22023';
    END IF;
    v_type := p_scope->>'itemType'; v_content := (p_scope->>'contentItemId')::uuid;
    v_color := p_scope->>'color'; v_query := lower(regexp_replace(trim(COALESCE(p_scope->>'filterQuery','')), '\s+', ' ', 'g'));
    IF char_length(v_query) > 160 THEN RAISE EXCEPTION 'invalid personal evidence filter' USING ERRCODE = '22023'; END IF;
    RETURN QUERY
    SELECT 'highlight'::text, h.id, h.user_id FROM public.user_highlights h
    LEFT JOIN public.content_item ci ON ci.id = h.content_item_id AND ci.status = 'verified' AND ci.deleted_at IS NULL
    LEFT JOIN public.segment s ON s.id = h.segment_id AND s.item_id = h.content_item_id AND s.deleted_at IS NULL AND ci.id IS NOT NULL
    WHERE h.user_id = v_user AND v_type <> 'reflection'
        AND (v_content IS NULL OR h.content_item_id = v_content) AND (v_color IS NULL OR h.color = v_color)
        AND (v_type = 'all' OR (v_type = 'note' AND COALESCE(h.note_body,'') !~ '^\s*$') OR (v_type = 'highlight' AND COALESCE(h.note_body,'') ~ '^\s*$'))
        AND (v_query = '' OR strpos(lower(h.highlighted_text),v_query) > 0 OR strpos(lower(COALESCE(h.note_body,'')),v_query) > 0
            OR strpos(lower(COALESCE(ci.title,'')),v_query) > 0 OR strpos(lower(COALESCE(ci.author,'')),v_query) > 0 OR strpos(lower(COALESCE(s.title,'')),v_query) > 0)
    UNION ALL
    SELECT 'reflection'::text, r.id, r.user_id FROM public.user_reflections r
    LEFT JOIN public.content_item ci ON ci.id = r.content_item_id AND ci.status = 'verified' AND ci.deleted_at IS NULL
    WHERE r.user_id = v_user AND v_type IN ('all','reflection') AND v_color IS NULL
        AND (v_content IS NULL OR r.content_item_id = v_content)
        AND (v_query = '' OR strpos(lower(r.prompt),v_query) > 0 OR strpos(lower(r.reflection_text),v_query) > 0
            OR strpos(lower(COALESCE(ci.title,'')),v_query) > 0 OR strpos(lower(COALESCE(ci.author,'')),v_query) > 0);
END;
$$;
REVOKE ALL ON FUNCTION private.personal_evidence_scope(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.match_personal_evidence(
    p_scope jsonb, p_query_embedding extensions.vector(768), p_match_count integer DEFAULT 8,
    p_min_similarity double precision DEFAULT 0.55, p_field text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
    IF p_query_embedding IS NULL OR extensions.vector_dims(p_query_embedding) <> 768 OR extensions.vector_norm(p_query_embedding) = 0
        OR p_min_similarity IS NULL OR p_min_similarity < -1 OR p_min_similarity > 1 OR p_min_similarity = 'NaN'::double precision
        OR (p_field IS NOT NULL AND p_field NOT IN ('highlightedText','noteBody','prompt','reflectionText')) THEN
        RAISE EXCEPTION 'invalid personal evidence ranking input' USING ERRCODE = '22023';
    END IF;
    WITH scoped AS MATERIALIZED (
        SELECT s.*, i.revision, i.state FROM private.personal_evidence_scope(p_scope) s
        LEFT JOIN private.personal_evidence_index i ON i.evidence_type = s.evidence_type AND i.evidence_id = s.evidence_id AND i.user_id = s.user_id
    ), coverage AS (
        SELECT count(*) AS total_records, count(*) FILTER (WHERE state = 'ready') AS ready_records,
            count(*) FILTER (WHERE state IS NULL OR state IN ('pending','processing')) AS pending_records,
            count(*) FILTER (WHERE state = 'failed') AS failed_records FROM scoped
    ), best_fields AS MATERIALIZED (
        SELECT DISTINCT ON (s.evidence_type,s.evidence_id,c.field)
            s.evidence_type,s.evidence_id,s.revision,c.field,c.chunk_index,c.start_offset,c.end_offset,
            1 - (c.embedding OPERATOR(extensions.<=>) p_query_embedding) AS similarity
        FROM scoped s JOIN private.personal_evidence_chunk c ON c.evidence_type = s.evidence_type AND c.evidence_id = s.evidence_id AND c.revision = s.revision
        CROSS JOIN coverage ready WHERE ready.total_records = ready.ready_records AND s.state = 'ready'
        ORDER BY s.evidence_type,s.evidence_id,c.field,(c.embedding OPERATOR(extensions.<=>) p_query_embedding),c.chunk_index
    ), qualified AS (
        SELECT evidence_type,evidence_id,max(similarity) AS record_similarity FROM best_fields
        WHERE (p_field IS NULL AND field <> 'prompt') OR field = p_field
        GROUP BY evidence_type,evidence_id HAVING max(similarity) >= p_min_similarity
    ), ranked_by_class AS (
        SELECT *, row_number() OVER (PARTITION BY evidence_type ORDER BY record_similarity DESC,evidence_id) AS class_rank
        FROM qualified
    ), selected AS MATERIALIZED (
        -- p_match_count is a per-class semantic candidate window, after exact
        -- ranking across the complete authorized scope: at most 32 highlights
        -- and 32 reflections. The application selects at most eight answers.
        SELECT * FROM ranked_by_class WHERE class_rank <= LEAST(GREATEST(COALESCE(p_match_count,8),1),32)
    )
    SELECT jsonb_build_object(
        'status', CASE WHEN totals.failed_records > 0 THEN 'failed' WHEN totals.pending_records > 0 THEN 'pending' ELSE 'ready' END,
        'total_records',totals.total_records,'ready_records',totals.ready_records,'pending_records',totals.pending_records,'failed_records',totals.failed_records,
        'matches',COALESCE((SELECT jsonb_agg(to_jsonb(b) || jsonb_build_object('record_similarity',s.record_similarity)
            ORDER BY s.record_similarity DESC,b.evidence_type,b.evidence_id,b.field)
            FROM best_fields b JOIN selected s USING (evidence_type,evidence_id)), '[]'::jsonb)
    ) INTO v_result FROM coverage totals;
    RETURN v_result;
END;
$$;

CREATE FUNCTION private.personal_evidence_index_status(p_scope jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    WITH coverage AS (
        SELECT count(*) AS total_records,count(*) FILTER (WHERE i.state = 'ready') AS ready_records,
            count(*) FILTER (WHERE i.state IS NULL OR i.state IN ('pending','processing')) AS pending_records,
            count(*) FILTER (WHERE i.state = 'failed') AS failed_records
        FROM private.personal_evidence_scope(p_scope) s
        LEFT JOIN private.personal_evidence_index i ON i.evidence_type=s.evidence_type AND i.evidence_id=s.evidence_id AND i.user_id=s.user_id
    ) SELECT to_jsonb(c) || jsonb_build_object('status',CASE WHEN failed_records > 0 THEN 'failed' WHEN pending_records > 0 THEN 'pending' ELSE 'ready' END) FROM coverage c;
$$;

-- Public wrappers are the only Data API surface. Storage and privileged helpers
-- remain outside exposed schemas, with no table grants to browser/service roles.
CREATE FUNCTION public.seed_personal_evidence_index(p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.seed_personal_evidence_index(p_limit); $$;
CREATE FUNCTION public.acquire_personal_evidence_worker(p_lease_seconds integer DEFAULT 90)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.acquire_personal_evidence_worker(p_lease_seconds); $$;
CREATE FUNCTION public.release_personal_evidence_worker(p_worker_token uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.release_personal_evidence_worker(p_worker_token); $$;
CREATE FUNCTION public.claim_personal_evidence_index(p_worker_token uuid,p_limit integer DEFAULT 10,p_lease_seconds integer DEFAULT 90)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.claim_personal_evidence_index(p_worker_token,p_limit,p_lease_seconds); $$;
CREATE FUNCTION public.complete_personal_evidence_index(p_evidence_type text,p_evidence_id uuid,p_revision uuid,p_lease_token uuid,p_chunks jsonb)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.complete_personal_evidence_index(p_evidence_type,p_evidence_id,p_revision,p_lease_token,p_chunks); $$;
CREATE FUNCTION public.fail_personal_evidence_index(p_evidence_type text,p_evidence_id uuid,p_revision uuid,p_lease_token uuid,p_retry_after_seconds integer DEFAULT 60,p_terminal boolean DEFAULT false,p_rate_limited boolean DEFAULT false)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.fail_personal_evidence_index(p_evidence_type,p_evidence_id,p_revision,p_lease_token,p_retry_after_seconds,p_terminal,p_rate_limited); $$;
CREATE FUNCTION public.personal_evidence_index_status(p_scope jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT private.personal_evidence_index_status(p_scope); $$;
CREATE FUNCTION public.match_personal_evidence(p_scope jsonb,p_query_embedding extensions.vector(768),p_match_count integer DEFAULT 8,p_min_similarity double precision DEFAULT 0.55,p_field text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT private.match_personal_evidence(p_scope,p_query_embedding,p_match_count,p_min_similarity,p_field); $$;

REVOKE ALL ON FUNCTION private.seed_personal_evidence_index(integer),public.seed_personal_evidence_index(integer),
    private.acquire_personal_evidence_worker(integer),public.acquire_personal_evidence_worker(integer),
    private.release_personal_evidence_worker(uuid),public.release_personal_evidence_worker(uuid),
    private.claim_personal_evidence_index(uuid,integer,integer),public.claim_personal_evidence_index(uuid,integer,integer),
    private.complete_personal_evidence_index(text,uuid,uuid,uuid,jsonb),public.complete_personal_evidence_index(text,uuid,uuid,uuid,jsonb),
    private.fail_personal_evidence_index(text,uuid,uuid,uuid,integer,boolean,boolean),public.fail_personal_evidence_index(text,uuid,uuid,uuid,integer,boolean,boolean)
    FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.seed_personal_evidence_index(integer),public.seed_personal_evidence_index(integer),
    private.acquire_personal_evidence_worker(integer),public.acquire_personal_evidence_worker(integer),
    private.release_personal_evidence_worker(uuid),public.release_personal_evidence_worker(uuid),
    private.claim_personal_evidence_index(uuid,integer,integer),public.claim_personal_evidence_index(uuid,integer,integer),
    private.complete_personal_evidence_index(text,uuid,uuid,uuid,jsonb),public.complete_personal_evidence_index(text,uuid,uuid,uuid,jsonb),
    private.fail_personal_evidence_index(text,uuid,uuid,uuid,integer,boolean,boolean),public.fail_personal_evidence_index(text,uuid,uuid,uuid,integer,boolean,boolean)
    TO service_role;
REVOKE ALL ON FUNCTION private.personal_evidence_index_status(jsonb),public.personal_evidence_index_status(jsonb),
    private.match_personal_evidence(jsonb,extensions.vector,integer,double precision,text),public.match_personal_evidence(jsonb,extensions.vector,integer,double precision,text)
    FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.personal_evidence_index_status(jsonb),public.personal_evidence_index_status(jsonb),
    private.match_personal_evidence(jsonb,extensions.vector,integer,double precision,text),public.match_personal_evidence(jsonb,extensions.vector,integer,double precision,text)
    TO authenticated;

COMMENT ON TABLE private.personal_evidence_index IS 'Current per-capture vector revision and bounded worker lease. No copied personal text. Edits invalidate transactionally; capture/account deletes cascade.';
COMMENT ON TABLE private.personal_evidence_chunk IS 'Persistent Gemini 768-dimensional personal field vectors with exact stored-field UTF-16 offsets. Read only through owner-scoped full-ranking RPC.';
COMMENT ON TABLE private.personal_evidence_provider_state IS 'Singleton provider retry deadline and token-fenced worker invocation lease. Capture edit/delete cannot clear provider cooldown or release another active worker.';
COMMENT ON FUNCTION public.match_personal_evidence(jsonb,extensions.vector,integer,double precision,text) IS 'Derives account from Auth, checks whole live scope readiness, exact-ranks all eligible chunks before limiting records, and returns strongest spans per field. No first-N candidate shortlist.';
RESET statement_timeout;
RESET lock_timeout;
