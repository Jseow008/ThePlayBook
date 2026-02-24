-- Hardening migration: scalable random fetch, scalable embedding candidates,
-- and atomic admin content graph updates.

CREATE OR REPLACE FUNCTION public.get_random_verified_content()
RETURNS TABLE(
    id uuid,
    type content_type,
    title text,
    source_url text,
    status content_status,
    quick_mode_json jsonb,
    duration_seconds integer,
    author text,
    cover_image_url text,
    category text,
    created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        ci.id,
        ci.type,
        ci.title,
        ci.source_url,
        ci.status,
        ci.quick_mode_json,
        ci.duration_seconds,
        ci.author,
        ci.cover_image_url,
        ci.category,
        ci.created_at
    FROM public.content_item ci
    WHERE ci.status = 'verified'
      AND ci.deleted_at IS NULL
    ORDER BY random()
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_segments_missing_embeddings(p_limit integer DEFAULT 50)
RETURNS TABLE(
    id uuid,
    content_item_id uuid,
    markdown_body text
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        s.id,
        s.item_id AS content_item_id,
        s.markdown_body
    FROM public.segment s
    LEFT JOIN public.segment_embedding se
      ON se.segment_id = s.id
    INNER JOIN public.content_item ci
      ON ci.id = s.item_id
    WHERE se.segment_id IS NULL
      AND ci.deleted_at IS NULL
      AND ci.status = 'verified'
    ORDER BY s.created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

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
            updated_at = now()
        WHERE id = p_content_id;
    END IF;

    IF p_segments IS NOT NULL THEN
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
