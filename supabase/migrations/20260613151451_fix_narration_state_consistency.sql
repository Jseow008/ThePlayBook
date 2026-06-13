-- Repair invalid narration states, persist narration-state changes made through
-- the admin content graph RPC, and prevent stale narration without audio.

UPDATE public.content_item
SET
    narration_status = 'idle',
    narration_error = NULL,
    narration_requested_at = NULL,
    narration_started_at = NULL,
    narration_completed_at = NULL,
    updated_at = now()
WHERE narration_status = 'stale'
  AND audio_url IS NULL;

ALTER TABLE public.content_item
DROP CONSTRAINT IF EXISTS content_item_stale_requires_audio_check;

ALTER TABLE public.content_item
ADD CONSTRAINT content_item_stale_requires_audio_check
CHECK (narration_status <> 'stale' OR audio_url IS NOT NULL);

CREATE OR REPLACE FUNCTION public.admin_update_content_graph(
    p_content_id uuid,
    p_content_patch jsonb DEFAULT '{}'::jsonb,
    p_segments jsonb DEFAULT NULL,
    p_artifacts jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_content_id IS NULL THEN
        RAISE EXCEPTION 'p_content_id is required';
    END IF;

    IF p_content_patch IS NOT NULL AND p_content_patch <> '{}'::jsonb THEN
        UPDATE public.content_item
        SET
            title = CASE WHEN p_content_patch ? 'title' THEN NULLIF(p_content_patch->>'title', '') ELSE title END,
            author = CASE WHEN p_content_patch ? 'author' THEN NULLIF(p_content_patch->>'author', '') ELSE author END,
            type = CASE WHEN p_content_patch ? 'type' THEN (p_content_patch->>'type')::content_type ELSE type END,
            category = CASE WHEN p_content_patch ? 'category' THEN NULLIF(p_content_patch->>'category', '') ELSE category END,
            source_url = CASE WHEN p_content_patch ? 'source_url' THEN NULLIF(p_content_patch->>'source_url', '') ELSE source_url END,
            cover_image_url = CASE WHEN p_content_patch ? 'cover_image_url' THEN NULLIF(p_content_patch->>'cover_image_url', '') ELSE cover_image_url END,
            hero_image_url = CASE WHEN p_content_patch ? 'hero_image_url' THEN NULLIF(p_content_patch->>'hero_image_url', '') ELSE hero_image_url END,
            audio_url = CASE WHEN p_content_patch ? 'audio_url' THEN NULLIF(p_content_patch->>'audio_url', '') ELSE audio_url END,
            narration_status = CASE WHEN p_content_patch ? 'narration_status' THEN p_content_patch->>'narration_status' ELSE narration_status END,
            narration_error = CASE WHEN p_content_patch ? 'narration_error' THEN NULLIF(p_content_patch->>'narration_error', '') ELSE narration_error END,
            narration_requested_at = CASE
                WHEN p_content_patch ? 'narration_requested_at' AND p_content_patch->>'narration_requested_at' IS NOT NULL
                    THEN (p_content_patch->>'narration_requested_at')::timestamptz
                WHEN p_content_patch ? 'narration_requested_at' THEN NULL
                ELSE narration_requested_at
            END,
            narration_started_at = CASE
                WHEN p_content_patch ? 'narration_started_at' AND p_content_patch->>'narration_started_at' IS NOT NULL
                    THEN (p_content_patch->>'narration_started_at')::timestamptz
                WHEN p_content_patch ? 'narration_started_at' THEN NULL
                ELSE narration_started_at
            END,
            narration_completed_at = CASE
                WHEN p_content_patch ? 'narration_completed_at' AND p_content_patch->>'narration_completed_at' IS NOT NULL
                    THEN (p_content_patch->>'narration_completed_at')::timestamptz
                WHEN p_content_patch ? 'narration_completed_at' THEN NULL
                ELSE narration_completed_at
            END,
            duration_seconds = CASE
                WHEN p_content_patch ? 'duration_seconds' AND p_content_patch->>'duration_seconds' IS NOT NULL
                    THEN NULLIF(p_content_patch->>'duration_seconds', '')::int
                WHEN p_content_patch ? 'duration_seconds' THEN NULL
                ELSE duration_seconds
            END,
            status = CASE WHEN p_content_patch ? 'status' THEN (p_content_patch->>'status')::content_status ELSE status END,
            is_featured = CASE WHEN p_content_patch ? 'is_featured' THEN (p_content_patch->>'is_featured')::boolean ELSE is_featured END,
            quick_mode_json = CASE
                WHEN p_content_patch ? 'quick_mode_json' THEN p_content_patch->'quick_mode_json'
                ELSE quick_mode_json
            END,
            series_id = CASE
                WHEN p_content_patch ? 'series_id' AND NULLIF(p_content_patch->>'series_id', '') IS NOT NULL
                    THEN (p_content_patch->>'series_id')::uuid
                WHEN p_content_patch ? 'series_id' THEN NULL
                ELSE series_id
            END,
            series_order = CASE
                WHEN p_content_patch ? 'series_order' AND p_content_patch->>'series_order' IS NOT NULL
                    THEN NULLIF(p_content_patch->>'series_order', '')::int
                WHEN p_content_patch ? 'series_order' THEN NULL
                ELSE series_order
            END,
            updated_at = now()
        WHERE id = p_content_id;
    END IF;

    IF p_segments IS NOT NULL THEN
        DROP TABLE IF EXISTS pg_temp.preserved_gemini_segment_embeddings;

        CREATE TEMP TABLE preserved_gemini_segment_embeddings ON COMMIT DROP AS
        SELECT
            seg.id,
            seg.segment_id,
            seg.content_item_id,
            seg.embedding,
            seg.created_at,
            BTRIM(s.markdown_body) AS markdown_body
        FROM public.segment_embedding_gemini seg
        INNER JOIN public.segment s
            ON s.id = seg.segment_id
        WHERE s.item_id = p_content_id;

        DELETE FROM public.segment WHERE item_id = p_content_id;

        INSERT INTO public.segment (
            id,
            item_id,
            order_index,
            title,
            markdown_body,
            start_time_sec,
            end_time_sec,
            updated_at
        )
        SELECT
            (x.id)::uuid,
            p_content_id,
            x.order_index,
            NULLIF(x.title, ''),
            x.markdown_body,
            x.start_time_sec,
            x.end_time_sec,
            now()
        FROM jsonb_to_recordset(COALESCE(p_segments, '[]'::jsonb)) AS x(
            id text,
            order_index int,
            title text,
            markdown_body text,
            start_time_sec int,
            end_time_sec int
        )
        WHERE x.id IS NOT NULL;

        INSERT INTO public.segment (
            item_id,
            order_index,
            title,
            markdown_body,
            start_time_sec,
            end_time_sec,
            updated_at
        )
        SELECT
            p_content_id,
            x.order_index,
            NULLIF(x.title, ''),
            x.markdown_body,
            x.start_time_sec,
            x.end_time_sec,
            now()
        FROM jsonb_to_recordset(COALESCE(p_segments, '[]'::jsonb)) AS x(
            id text,
            order_index int,
            title text,
            markdown_body text,
            start_time_sec int,
            end_time_sec int
        )
        WHERE x.id IS NULL;

        INSERT INTO public.segment_embedding_gemini (
            id,
            segment_id,
            content_item_id,
            embedding,
            created_at
        )
        SELECT
            preserved.id,
            preserved.segment_id,
            s.item_id,
            preserved.embedding,
            preserved.created_at
        FROM pg_temp.preserved_gemini_segment_embeddings preserved
        INNER JOIN public.segment s
            ON s.id = preserved.segment_id
        INNER JOIN public.content_item ci
            ON ci.id = s.item_id
        WHERE s.item_id = p_content_id
          AND ci.deleted_at IS NULL
          AND ci.status = 'verified'
          AND BTRIM(s.markdown_body) IS NOT DISTINCT FROM preserved.markdown_body
        ON CONFLICT (segment_id) DO UPDATE
        SET
            content_item_id = EXCLUDED.content_item_id,
            embedding = EXCLUDED.embedding;
    END IF;

    IF p_artifacts IS NOT NULL THEN
        DELETE FROM public.artifact WHERE item_id = p_content_id;

        INSERT INTO public.artifact (
            item_id,
            type,
            payload_schema,
            version,
            updated_at
        )
        SELECT
            p_content_id,
            (x.type)::artifact_type,
            x.payload_schema,
            COALESCE(NULLIF(x.version, ''), '1.0.0'),
            now()
        FROM jsonb_to_recordset(COALESCE(p_artifacts, '[]'::jsonb)) AS x(
            type text,
            payload_schema jsonb,
            version text
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_content_graph(uuid, jsonb, jsonb, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_content_graph(uuid, jsonb, jsonb, jsonb)
TO service_role;
