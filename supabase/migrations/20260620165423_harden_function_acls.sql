-- Repair drifted SECURITY DEFINER function privileges in production.
--
-- Functions are executable by PUBLIC by default in Postgres. Keep future
-- migrations explicit about RPC exposure and avoid accidental anon access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM authenticated;

CREATE OR REPLACE FUNCTION public.insert_generated_content(
  p_title text,
  p_type public.content_type,
  p_author text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_status public.content_status DEFAULT 'draft'::public.content_status,
  p_quick_mode_json jsonb DEFAULT '{}'::jsonb,
  p_segments jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content_id uuid;
  v_segment jsonb;
  v_index int := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'insert_generated_content requires service role';
  END IF;

  INSERT INTO public.content_item (title, type, author, category, status, quick_mode_json)
  VALUES (p_title, p_type, p_author, p_category, p_status, p_quick_mode_json)
  RETURNING id INTO v_content_id;

  FOR v_segment IN SELECT * FROM jsonb_array_elements(p_segments)
  LOOP
    INSERT INTO public.segment (item_id, order_index, title, markdown_body)
    VALUES (
      v_content_id,
      v_index,
      v_segment->>'title',
      v_segment->>'content'
    );
    v_index := v_index + 1;
  END LOOP;

  RETURN v_content_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finalize_narration_generation(
    p_content_id uuid,
    p_expected_started_at timestamptz,
    p_audio_url text,
    p_completed_at timestamptz,
    p_segment_timings jsonb DEFAULT '[]'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_id uuid;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_finalize_narration_generation requires service role';
    END IF;

    UPDATE public.content_item
    SET
        audio_url = p_audio_url,
        narration_status = 'ready',
        narration_error = NULL,
        narration_requested_at = NULL,
        narration_started_at = NULL,
        narration_completed_at = p_completed_at,
        updated_at = now()
    WHERE id = p_content_id
      AND status = 'verified'
      AND narration_status = 'processing'
      AND narration_started_at = p_expected_started_at
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.segment
    SET
        start_time_sec = NULL,
        end_time_sec = NULL,
        updated_at = now()
    WHERE item_id = p_content_id;

    UPDATE public.segment AS s
    SET
        start_time_sec = x.start_time_sec,
        end_time_sec = x.end_time_sec,
        updated_at = now()
    FROM jsonb_to_recordset(COALESCE(p_segment_timings, '[]'::jsonb)) AS x(
        id uuid,
        start_time_sec int,
        end_time_sec int
    )
    WHERE s.item_id = p_content_id
      AND s.id = x.id;

    RETURN TRUE;
END;
$$;

-- Public read RPCs should not bypass RLS. These retain explicit anon grants.
ALTER FUNCTION public.get_homepage_sections_with_items(integer)
SECURITY INVOKER;

ALTER FUNCTION public.get_homepage_sections_with_items(integer)
SET search_path = public;

ALTER FUNCTION public.get_trending_content(integer, public.content_type, text[])
SECURITY INVOKER;

ALTER FUNCTION public.get_trending_content(integer, public.content_type, text[])
SET search_path = '';

-- Definer helpers and trigger functions must resolve objects deterministically.
ALTER FUNCTION public.handle_new_user()
SET search_path = public;

ALTER FUNCTION public.is_admin()
SET search_path = public;

ALTER FUNCTION public.set_onboarding_state(text, text, text)
SET search_path = public;

ALTER FUNCTION public.claim_content_request_notifications(integer)
SET search_path = public;

ALTER FUNCTION public.queue_content_request_published_notifications(uuid)
SET search_path = public;

ALTER FUNCTION public.submit_content_request(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  public.content_type,
  text
)
SET search_path = public;

DO $$
DECLARE
  target regprocedure;
BEGIN
  target := to_regprocedure('public.invalidate_gemini_segment_embedding_on_body_change()');

  IF target IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION ' || target || ' SET search_path = public';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || target || ' FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || target || ' TO service_role';
  END IF;
END;
$$;

-- Admin-only and trigger-only entrypoints.
REVOKE EXECUTE ON FUNCTION public.insert_generated_content(
  text,
  public.content_type,
  text,
  text,
  public.content_status,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_generated_content(
  text,
  public.content_type,
  text,
  text,
  public.content_status,
  jsonb,
  jsonb
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_finalize_narration_generation(
  uuid,
  timestamptz,
  text,
  timestamptz,
  jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_narration_generation(
  uuid,
  timestamptz,
  text,
  timestamptz,
  jsonb
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_content_request_notifications(integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_content_request_notifications(integer)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.queue_content_request_published_notifications(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_content_request_published_notifications(uuid)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user()
TO service_role;

REVOKE EXECUTE ON FUNCTION public.submit_content_request(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  public.content_type,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_content_request(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  public.content_type,
  text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_update_content_graph(uuid, jsonb, jsonb, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_content_graph(uuid, jsonb, jsonb, jsonb)
TO service_role;

-- Authenticated/user-scoped helpers.
REVOKE EXECUTE ON FUNCTION public.is_admin()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin()
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_onboarding_state(text, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_onboarding_state(text, text, text)
TO authenticated, service_role;

-- Public read entrypoints that remain callable by anonymous clients.
REVOKE EXECUTE ON FUNCTION public.get_homepage_sections_with_items(integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_homepage_sections_with_items(integer)
TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_trending_content(integer, public.content_type, text[])
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trending_content(integer, public.content_type, text[])
TO anon, authenticated, service_role;
