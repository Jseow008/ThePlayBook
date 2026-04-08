CREATE OR REPLACE FUNCTION public.match_recommendations(
    seed_ids uuid[],
    exclude_ids uuid[] DEFAULT '{}'::uuid[],
    match_count integer DEFAULT 6
)
 RETURNS TABLE(id uuid, type content_type, title text, source_url text, status content_status, quick_mode_json jsonb, duration_seconds integer, author text, cover_image_url text, hero_image_url text, category text, is_featured boolean, audio_url text, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone, similarity double precision)
 LANGUAGE plpgsql
AS $function$
DECLARE
    avg_embedding vector(768);
    seed_cats text[];
BEGIN
    SELECT AVG(ci.embedding)::vector(768) INTO avg_embedding
    FROM public.content_item ci
    WHERE ci.id = ANY(seed_ids)
      AND ci.embedding IS NOT NULL;

    IF avg_embedding IS NULL THEN
        SELECT array_agg(DISTINCT ci.category) INTO seed_cats
        FROM public.content_item ci
        WHERE ci.id = ANY(seed_ids)
          AND ci.category IS NOT NULL;

        IF seed_cats IS NOT NULL AND array_length(seed_cats, 1) > 0 THEN
            RETURN QUERY
            SELECT
                ci.id, ci.type, ci.title, ci.source_url, ci.status, ci.quick_mode_json,
                ci.duration_seconds, ci.author, ci.cover_image_url, ci.hero_image_url,
                ci.category, ci.is_featured, ci.audio_url, ci.created_at, ci.updated_at, ci.deleted_at,
                0::double precision AS similarity
            FROM public.content_item ci
            WHERE ci.id != ALL(exclude_ids)
              AND ci.status = 'verified'
              AND ci.deleted_at IS NULL
              AND ci.category = ANY(seed_cats)
            ORDER BY ci.created_at DESC
            LIMIT match_count;
        END IF;

        RETURN QUERY
        SELECT
            ci.id, ci.type, ci.title, ci.source_url, ci.status, ci.quick_mode_json,
            ci.duration_seconds, ci.author, ci.cover_image_url, ci.hero_image_url,
            ci.category, ci.is_featured, ci.audio_url, ci.created_at, ci.updated_at, ci.deleted_at,
            0::double precision AS similarity
        FROM public.content_item ci
        WHERE ci.id != ALL(exclude_ids)
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
    WHERE ci.id != ALL(exclude_ids)
      AND ci.status = 'verified'
      AND ci.deleted_at IS NULL
      AND ci.embedding IS NOT NULL
    ORDER BY ci.embedding <=> avg_embedding
    LIMIT match_count;
END;
$function$
