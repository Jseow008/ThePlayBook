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
