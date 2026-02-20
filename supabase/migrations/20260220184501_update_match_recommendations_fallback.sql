CREATE OR REPLACE FUNCTION public.match_recommendations(completed_ids uuid[], match_count integer DEFAULT 6)
 RETURNS TABLE(id uuid, type content_type, title text, source_url text, status content_status, quick_mode_json jsonb, duration_seconds integer, author text, cover_image_url text, hero_image_url text, category text, is_featured boolean, audio_url text, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone, similarity double precision)
 LANGUAGE plpgsql
AS $function$
DECLARE
    avg_embedding vector(768);
    completed_cats text[];
BEGIN
    SELECT AVG(ci.embedding)::vector(768) INTO avg_embedding
    FROM public.content_item ci
    WHERE ci.id = ANY(completed_ids)
      AND ci.embedding IS NOT NULL;

    -- If no embeddings are found, fallback to category-based or latest
    IF avg_embedding IS NULL THEN
        -- Get categories of the completed items
        SELECT array_agg(DISTINCT ci.category) INTO completed_cats
        FROM public.content_item ci
        WHERE ci.id = ANY(completed_ids)
          AND ci.category IS NOT NULL;

        IF completed_cats IS NOT NULL AND array_length(completed_cats, 1) > 0 THEN
            RETURN QUERY
            SELECT
                ci.id, ci.type, ci.title, ci.source_url, ci.status, ci.quick_mode_json,
                ci.duration_seconds, ci.author, ci.cover_image_url, ci.hero_image_url,
                ci.category, ci.is_featured, ci.audio_url, ci.created_at, ci.updated_at, ci.deleted_at,
                0::double precision AS similarity
            FROM public.content_item ci
            WHERE ci.id != ALL(completed_ids)
              AND ci.status = 'verified'
              AND ci.deleted_at IS NULL
              AND ci.category = ANY(completed_cats)
            ORDER BY ci.created_at DESC
            LIMIT match_count;
        END IF;

        -- If still not enough, or no category match, just return latest
        RETURN QUERY
        SELECT
            ci.id, ci.type, ci.title, ci.source_url, ci.status, ci.quick_mode_json,
            ci.duration_seconds, ci.author, ci.cover_image_url, ci.hero_image_url,
            ci.category, ci.is_featured, ci.audio_url, ci.created_at, ci.updated_at, ci.deleted_at,
            0::double precision AS similarity
        FROM public.content_item ci
        WHERE ci.id != ALL(completed_ids)
          AND ci.status = 'verified'
          AND ci.deleted_at IS NULL
        ORDER BY ci.created_at DESC
        LIMIT match_count;

        RETURN;
    END IF;

    RETURN QUERY
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
        ci.hero_image_url,
        ci.category,
        ci.is_featured,
        ci.audio_url,
        ci.created_at,
        ci.updated_at,
        ci.deleted_at,
        1 - (ci.embedding <=> avg_embedding) AS similarity
    FROM public.content_item ci
    WHERE ci.id != ALL(completed_ids)
      AND ci.status = 'verified'
      AND ci.deleted_at IS NULL
      AND ci.embedding IS NOT NULL
    ORDER BY ci.embedding <=> avg_embedding
    LIMIT match_count;
END;
$function$
