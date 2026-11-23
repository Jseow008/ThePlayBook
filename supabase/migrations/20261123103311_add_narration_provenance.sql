ALTER TABLE public.content_item
    ADD COLUMN narration_generated_by text,
    ADD COLUMN narration_voice text,
    ADD COLUMN narration_requested_by text;

-- External audio replacements cannot inherit the previous file's provenance.
CREATE FUNCTION public.clear_replaced_narration_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.narration_generated_by := NULL;
    NEW.narration_voice := NULL;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_replaced_narration_provenance()
    FROM PUBLIC, anon, authenticated;

CREATE TRIGGER clear_replaced_narration_provenance
BEFORE UPDATE OF audio_url ON public.content_item
FOR EACH ROW WHEN (OLD.audio_url IS DISTINCT FROM NEW.audio_url)
EXECUTE FUNCTION public.clear_replaced_narration_provenance();

-- The new optional argument keeps calls from the preceding deployment valid.
DROP FUNCTION public.admin_finalize_narration_generation(uuid, timestamptz, text, timestamptz, jsonb);

CREATE OR REPLACE FUNCTION public.admin_finalize_narration_generation(
    p_content_id uuid,
    p_expected_started_at timestamptz,
    p_audio_url text,
    p_completed_at timestamptz,
    p_segment_timings jsonb DEFAULT '[]'::jsonb,
    p_voice text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_id uuid;
    v_requested_by text;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
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
      AND deleted_at IS NULL
      AND narration_started_at = p_expected_started_at
    RETURNING id, narration_requested_by INTO v_updated_id, v_requested_by;

    IF v_updated_id IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.content_item
    SET narration_generated_by = v_requested_by,
        narration_voice = p_voice,
        narration_requested_by = NULL
    WHERE id = v_updated_id;

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

REVOKE EXECUTE ON FUNCTION public.admin_finalize_narration_generation(uuid, timestamptz, text, timestamptz, jsonb, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_narration_generation(uuid, timestamptz, text, timestamptz, jsonb, text)
    TO service_role;
