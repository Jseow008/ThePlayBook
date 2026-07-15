-- Production-recorded version 20260621162133 — full item 3 follow-up:
-- - Add runtime service-role guards to service-only SECURITY DEFINER RPCs
--   discovered by live function inventory.
-- - Lock trigger-only helpers against direct anon/authenticated execution
--   without adding auth.role() guards that could break trigger context.
-- - Fix mutable search_path on public functions found during the audit.

CREATE OR REPLACE FUNCTION public.increment_reading_activity_for_user(
    p_activity_date date,
    p_duration_seconds integer,
    p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'increment_reading_activity_for_user requires service role';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;

    IF p_duration_seconds IS NULL OR p_duration_seconds <= 0 THEN
        RAISE EXCEPTION 'duration_seconds must be greater than 0';
    END IF;

    INSERT INTO public.reading_activity (user_id, activity_date, duration_seconds)
    VALUES (p_user_id, p_activity_date, p_duration_seconds)
    ON CONFLICT (user_id, activity_date)
    DO UPDATE SET
        duration_seconds = public.reading_activity.duration_seconds + excluded.duration_seconds,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.log_reading_activity(
    p_activity_date date,
    p_duration_seconds integer,
    p_content_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_reader_inserted integer;
    v_is_internal boolean;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'log_reading_activity requires service role';
    END IF;

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_duration_seconds IS NULL OR p_duration_seconds <= 0 THEN
        RAISE EXCEPTION 'duration_seconds must be greater than 0';
    END IF;

    INSERT INTO public.reading_activity (user_id, activity_date, duration_seconds)
    VALUES (v_user_id, p_activity_date, p_duration_seconds)
    ON CONFLICT (user_id, activity_date)
    DO UPDATE SET
        duration_seconds = public.reading_activity.duration_seconds + excluded.duration_seconds,
        updated_at = now();

    IF p_content_id IS NULL THEN
        RETURN;
    END IF;

    SELECT coalesce(is_internal, false)
    INTO v_is_internal
    FROM public.profiles
    WHERE id = v_user_id;

    IF coalesce(v_is_internal, false) THEN
        RETURN;
    END IF;

    INSERT INTO public.content_reading_activity (content_id, activity_date, duration_seconds, reader_count)
    VALUES (p_content_id, p_activity_date, p_duration_seconds, 0)
    ON CONFLICT (content_id, activity_date)
    DO UPDATE SET
        duration_seconds = public.content_reading_activity.duration_seconds + excluded.duration_seconds,
        updated_at = now();

    INSERT INTO public.content_reader_daily (content_id, user_id, activity_date)
    VALUES (p_content_id, v_user_id, p_activity_date)
    ON CONFLICT (content_id, user_id, activity_date) DO NOTHING;

    GET DIAGNOSTICS v_reader_inserted = ROW_COUNT;

    IF v_reader_inserted > 0 THEN
        UPDATE public.content_reading_activity
        SET
            reader_count = reader_count + 1,
            updated_at = now()
        WHERE content_id = p_content_id
          AND activity_date = p_activity_date;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_anonymous_reading_activity(
    p_activity_date date,
    p_duration_seconds integer,
    p_content_id uuid,
    p_visitor_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reader_inserted integer;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'log_anonymous_reading_activity requires service role';
    END IF;

    IF p_content_id IS NULL THEN
        RAISE EXCEPTION 'content_id is required';
    END IF;

    IF p_visitor_id IS NULL OR length(trim(p_visitor_id)) = 0 THEN
        RAISE EXCEPTION 'visitor_id is required';
    END IF;

    IF p_duration_seconds IS NULL OR p_duration_seconds <= 0 THEN
        RAISE EXCEPTION 'duration_seconds must be greater than 0';
    END IF;

    INSERT INTO public.content_reading_activity (content_id, activity_date, duration_seconds, reader_count)
    VALUES (p_content_id, p_activity_date, p_duration_seconds, 0)
    ON CONFLICT (content_id, activity_date)
    DO UPDATE SET
        duration_seconds = public.content_reading_activity.duration_seconds + excluded.duration_seconds,
        updated_at = now();

    INSERT INTO public.content_reader_visitor_daily (content_id, visitor_id, activity_date)
    VALUES (p_content_id, p_visitor_id, p_activity_date)
    ON CONFLICT (content_id, visitor_id, activity_date) DO NOTHING;

    GET DIAGNOSTICS v_reader_inserted = ROW_COUNT;

    IF v_reader_inserted > 0 THEN
        UPDATE public.content_reading_activity
        SET
            reader_count = reader_count + 1,
            updated_at = now()
        WHERE content_id = p_content_id
          AND activity_date = p_activity_date;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_reading_activity_for_user(
    p_activity_date date,
    p_duration_seconds integer,
    p_content_id uuid,
    p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reader_inserted integer;
    v_is_internal boolean;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'log_reading_activity_for_user requires service role';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;

    IF p_duration_seconds IS NULL OR p_duration_seconds <= 0 THEN
        RAISE EXCEPTION 'duration_seconds must be greater than 0';
    END IF;

    PERFORM public.increment_reading_activity_for_user(
        p_activity_date,
        p_duration_seconds,
        p_user_id
    );

    IF p_content_id IS NULL THEN
        RETURN;
    END IF;

    SELECT coalesce(is_internal, false)
    INTO v_is_internal
    FROM public.profiles
    WHERE id = p_user_id;

    IF coalesce(v_is_internal, false) THEN
        RETURN;
    END IF;

    INSERT INTO public.content_reading_activity (content_id, activity_date, duration_seconds, reader_count)
    VALUES (p_content_id, p_activity_date, p_duration_seconds, 0)
    ON CONFLICT (content_id, activity_date)
    DO UPDATE SET
        duration_seconds = public.content_reading_activity.duration_seconds + excluded.duration_seconds,
        updated_at = now();

    INSERT INTO public.content_reader_daily (content_id, user_id, activity_date)
    VALUES (p_content_id, p_user_id, p_activity_date)
    ON CONFLICT (content_id, user_id, activity_date) DO NOTHING;

    GET DIAGNOSTICS v_reader_inserted = ROW_COUNT;

    IF v_reader_inserted > 0 THEN
        UPDATE public.content_reading_activity
        SET
            reader_count = reader_count + 1,
            updated_at = now()
        WHERE content_id = p_content_id
          AND activity_date = p_activity_date;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_reading_activity_for_user(date, integer, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_reading_activity_for_user(date, integer, uuid)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.log_reading_activity(date, integer, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_reading_activity(date, integer, uuid)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.log_anonymous_reading_activity(date, integer, uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_anonymous_reading_activity(date, integer, uuid, text)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.log_reading_activity_for_user(date, integer, uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_reading_activity_for_user(date, integer, uuid, uuid)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user()
TO service_role;

REVOKE EXECUTE ON FUNCTION public.invalidate_gemini_segment_embedding_on_body_change()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_gemini_segment_embedding_on_body_change()
TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_content_request_vote_count()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_content_request_vote_count()
TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column()
TO service_role;

ALTER FUNCTION public.get_category_stats()
SET search_path = public;

ALTER FUNCTION public.get_random_verified_content()
SET search_path = public;

ALTER FUNCTION public.get_segments_missing_embeddings(integer)
SET search_path = public;

ALTER FUNCTION public.get_segments_missing_gemini_embeddings(integer)
SET search_path = public;

ALTER FUNCTION public.get_gemini_segment_embedding_coverage()
SET search_path = public;

ALTER FUNCTION public.increment_reading_activity(date, integer)
SET search_path = public;

ALTER FUNCTION public.match_library_segments(extensions.vector, double precision, integer, uuid)
SET search_path = public, extensions;

ALTER FUNCTION public.match_library_segments_gemini(extensions.vector, double precision, integer, uuid, boolean)
SET search_path = public, extensions;

ALTER FUNCTION public.match_recommendations(uuid[], uuid[], integer)
SET search_path = public, extensions;

ALTER FUNCTION public.update_content_request_vote_count()
SET search_path = public;

ALTER FUNCTION public.update_updated_at_column()
SET search_path = public;
