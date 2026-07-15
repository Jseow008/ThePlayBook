-- Preserve user-created highlights by reconciling the submitted segment graph
-- in place. Existing segment UUIDs survive edits and reordering. A submitted
-- graph that omits any highlighted segment fails atomically.

CREATE OR REPLACE FUNCTION public.admin_update_content_graph(
    p_content_id uuid,
    p_content_patch jsonb DEFAULT '{}'::jsonb,
    p_segments jsonb DEFAULT NULL,
    p_artifacts jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_highlight_count bigint;
    v_highlighted_segment_count bigint;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_update_content_graph requires service role';
    END IF;

    IF p_content_id IS NULL THEN
        RAISE EXCEPTION 'p_content_id is required';
    END IF;

    -- Serialize graph saves and prevent concurrent segment/highlight inserts
    -- from racing the omission check below.
    PERFORM 1
    FROM public.content_item
    WHERE id = p_content_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'content item % does not exist', p_content_id
            USING ERRCODE = 'P0002';
    END IF;

    PERFORM s.id
    FROM public.segment AS s
    WHERE s.item_id = p_content_id
    ORDER BY s.id
    FOR UPDATE;

    IF p_segments IS NOT NULL THEN
        IF pg_catalog.jsonb_typeof(p_segments) IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'p_segments must be a JSON array'
                USING ERRCODE = '22023';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_to_recordset(p_segments) AS incoming(
                id uuid,
                order_index integer,
                title text,
                markdown_body text,
                start_time_sec integer,
                end_time_sec integer
            )
            WHERE incoming.order_index IS NULL
               OR incoming.order_index < 0
               OR incoming.markdown_body IS NULL
        ) THEN
            RAISE EXCEPTION 'submitted segments require a nonnegative order_index and nonnull markdown_body'
                USING ERRCODE = '22023';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_to_recordset(p_segments) AS incoming(
                id uuid,
                order_index integer,
                title text,
                markdown_body text,
                start_time_sec integer,
                end_time_sec integer
            )
            GROUP BY incoming.order_index
            HAVING pg_catalog.count(*) > 1
        ) OR EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_to_recordset(p_segments) AS incoming(
                id uuid,
                order_index integer,
                title text,
                markdown_body text,
                start_time_sec integer,
                end_time_sec integer
            )
            WHERE incoming.id IS NOT NULL
            GROUP BY incoming.id
            HAVING pg_catalog.count(*) > 1
        ) THEN
            RAISE EXCEPTION 'submitted segment IDs and order indexes must be unique'
                USING ERRCODE = '22023';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_to_recordset(p_segments) AS incoming(
                id uuid,
                order_index integer,
                title text,
                markdown_body text,
                start_time_sec integer,
                end_time_sec integer
            )
            LEFT JOIN public.segment AS existing
                ON existing.id = incoming.id
            WHERE incoming.id IS NOT NULL
              AND (
                  existing.id IS NULL
                  OR existing.item_id IS DISTINCT FROM p_content_id
              )
        ) THEN
            RAISE EXCEPTION 'submitted segment IDs must already belong to content item %', p_content_id
                USING ERRCODE = '22023';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.segment
            WHERE item_id = p_content_id
              AND order_index < 0
        ) THEN
            RAISE EXCEPTION 'existing segment order indexes must be nonnegative before graph reconciliation'
                USING ERRCODE = '22023';
        END IF;

        SELECT
            COUNT(*),
            COUNT(DISTINCT existing.id)
        INTO
            v_highlight_count,
            v_highlighted_segment_count
        FROM public.segment AS existing
        INNER JOIN public.user_highlights AS highlight
            ON highlight.segment_id = existing.id
        WHERE existing.item_id = p_content_id
          AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.jsonb_to_recordset(p_segments) AS incoming(
                  id uuid,
                  order_index integer,
                  title text,
                  markdown_body text,
                  start_time_sec integer,
                  end_time_sec integer
              )
              WHERE incoming.id = existing.id
          );

        IF v_highlight_count > 0 THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'DB002_HIGHLIGHTED_SEGMENT_REMOVAL',
                DETAIL = pg_catalog.format(
                    'The update omits %s segment(s) containing %s saved highlight(s).',
                    v_highlighted_segment_count,
                    v_highlight_count
                ),
                HINT = 'Keep highlighted segment UUIDs until an explicit highlight-retention workflow is used.';
        END IF;
    END IF;

    IF p_content_patch IS NOT NULL AND p_content_patch <> '{}'::jsonb THEN
        UPDATE public.content_item
        SET
            title = CASE WHEN p_content_patch ? 'title' THEN NULLIF(p_content_patch->>'title', '') ELSE title END,
            author = CASE WHEN p_content_patch ? 'author' THEN NULLIF(p_content_patch->>'author', '') ELSE author END,
            type = CASE WHEN p_content_patch ? 'type' THEN (p_content_patch->>'type')::public.content_type ELSE type END,
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
                    THEN NULLIF(p_content_patch->>'duration_seconds', '')::integer
                WHEN p_content_patch ? 'duration_seconds' THEN NULL
                ELSE duration_seconds
            END,
            status = CASE WHEN p_content_patch ? 'status' THEN (p_content_patch->>'status')::public.content_status ELSE status END,
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
                    THEN NULLIF(p_content_patch->>'series_order', '')::integer
                WHEN p_content_patch ? 'series_order' THEN NULL
                ELSE series_order
            END,
            updated_at = pg_catalog.now()
        WHERE id = p_content_id;
    END IF;

    IF p_segments IS NOT NULL THEN
        -- Move existing rows into a collision-free temporary order range so
        -- swaps remain compatible with the immediate (item_id, order_index)
        -- unique constraint. Production has no negative order indexes.
        WITH ordered_existing AS (
            SELECT
                existing.id,
                ROW_NUMBER() OVER (
                    ORDER BY existing.order_index, existing.id
                )::integer AS temporary_order
            FROM public.segment AS existing
            WHERE existing.item_id = p_content_id
        )
        UPDATE public.segment AS existing
        SET order_index = -ordered_existing.temporary_order
        FROM ordered_existing
        WHERE existing.id = ordered_existing.id;

        DELETE FROM public.segment AS existing
        WHERE existing.item_id = p_content_id
          AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.jsonb_to_recordset(p_segments) AS incoming(
                  id uuid,
                  order_index integer,
                  title text,
                  markdown_body text,
                  start_time_sec integer,
                  end_time_sec integer
              )
              WHERE incoming.id = existing.id
          );

        UPDATE public.segment AS existing
        SET
            order_index = incoming.order_index,
            title = NULLIF(incoming.title, ''),
            markdown_body = incoming.markdown_body,
            start_time_sec = incoming.start_time_sec,
            end_time_sec = incoming.end_time_sec,
            updated_at = pg_catalog.now()
        FROM pg_catalog.jsonb_to_recordset(p_segments) AS incoming(
            id uuid,
            order_index integer,
            title text,
            markdown_body text,
            start_time_sec integer,
            end_time_sec integer
        )
        WHERE incoming.id = existing.id
          AND existing.item_id = p_content_id;

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
            incoming.order_index,
            NULLIF(incoming.title, ''),
            incoming.markdown_body,
            incoming.start_time_sec,
            incoming.end_time_sec,
            pg_catalog.now()
        FROM pg_catalog.jsonb_to_recordset(p_segments) AS incoming(
            id uuid,
            order_index integer,
            title text,
            markdown_body text,
            start_time_sec integer,
            end_time_sec integer
        )
        WHERE incoming.id IS NULL;

        -- Preserve the previous verified-only embedding lifecycle. The
        -- retrieval function is scoped to a user's library but does not
        -- independently filter content status.
        DELETE FROM public.segment_embedding_gemini AS embedding
        USING public.content_item AS content
        WHERE embedding.content_item_id = p_content_id
          AND content.id = p_content_id
          AND (
              content.deleted_at IS NOT NULL
              OR content.status IS DISTINCT FROM 'verified'::public.content_status
          );
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
            (x.type)::public.artifact_type,
            x.payload_schema,
            COALESCE(NULLIF(x.version, ''), '1.0.0'),
            pg_catalog.now()
        FROM pg_catalog.jsonb_to_recordset(COALESCE(p_artifacts, '[]'::jsonb)) AS x(
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
