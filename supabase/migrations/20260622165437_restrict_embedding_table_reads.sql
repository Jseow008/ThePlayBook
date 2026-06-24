-- Restrict direct embedding table reads while preserving approved vector RPCs.
-- Public wrappers remain SECURITY INVOKER; private helpers perform the
-- privileged embedding reads with explicit user/session boundaries.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DO $$
BEGIN
    IF to_regclass('public.segment_embedding') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for all users" ON public.segment_embedding';

        REVOKE SELECT ON public.segment_embedding
        FROM PUBLIC, anon, authenticated;

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.segment_embedding
        TO service_role;

        EXECUTE $ddl$
            CREATE OR REPLACE FUNCTION private.match_library_segments_internal(
                p_query_embedding extensions.vector(1536),
                p_match_threshold double precision,
                p_match_count integer,
                p_user_id uuid
            )
            RETURNS TABLE(
                segment_id uuid,
                content_item_id uuid,
                similarity double precision
            )
            LANGUAGE plpgsql
            STABLE
            SECURITY DEFINER
            SET search_path = public, extensions
            AS $function$
            BEGIN
                IF auth.role() <> 'service_role'
                   AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
                    RAISE EXCEPTION 'cannot match another user''s library'
                        USING ERRCODE = '42501';
                END IF;

                RETURN QUERY
                SELECT
                    se.segment_id,
                    se.content_item_id,
                    1 - (se.embedding <=> p_query_embedding) AS similarity
                FROM public.segment_embedding se
                INNER JOIN public.user_library ul
                    ON ul.content_id = se.content_item_id
                   AND ul.user_id = p_user_id
                INNER JOIN public.content_item ci
                    ON ci.id = se.content_item_id
                WHERE ci.status = 'verified'
                  AND ci.deleted_at IS NULL
                  AND 1 - (se.embedding <=> p_query_embedding) > p_match_threshold
                ORDER BY se.embedding <=> p_query_embedding
                LIMIT LEAST(GREATEST(COALESCE(p_match_count, 3), 1), 50);
            END;
            $function$;
        $ddl$;

        EXECUTE $ddl$
            CREATE OR REPLACE FUNCTION public.match_library_segments(
                query_embedding extensions.vector(1536),
                match_threshold double precision,
                match_count integer,
                p_user_id uuid
            )
            RETURNS TABLE(
                segment_id uuid,
                content_item_id uuid,
                similarity double precision
            )
            LANGUAGE sql
            STABLE
            SECURITY INVOKER
            SET search_path = public, extensions
            AS $function$
                SELECT
                    matched.segment_id,
                    matched.content_item_id,
                    matched.similarity
                FROM private.match_library_segments_internal(
                    query_embedding,
                    match_threshold,
                    match_count,
                    p_user_id
                ) matched;
            $function$;
        $ddl$;

        REVOKE EXECUTE ON FUNCTION private.match_library_segments_internal(
            extensions.vector(1536),
            double precision,
            integer,
            uuid
        )
        FROM PUBLIC, anon, authenticated;

        GRANT EXECUTE ON FUNCTION private.match_library_segments_internal(
            extensions.vector(1536),
            double precision,
            integer,
            uuid
        )
        TO authenticated, service_role;

        REVOKE EXECUTE ON FUNCTION public.match_library_segments(
            extensions.vector(1536),
            double precision,
            integer,
            uuid
        )
        FROM PUBLIC, anon, authenticated;

        GRANT EXECUTE ON FUNCTION public.match_library_segments(
            extensions.vector(1536),
            double precision,
            integer,
            uuid
        )
        TO authenticated, service_role;
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regprocedure('public.match_library_segments(vector,double precision,integer,uuid)') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.match_library_segments(
            extensions.vector(1536),
            double precision,
            integer,
            uuid
        )
        FROM PUBLIC, anon, authenticated;

        GRANT EXECUTE ON FUNCTION public.match_library_segments(
            extensions.vector(1536),
            double precision,
            integer,
            uuid
        )
        TO authenticated, service_role;
    END IF;
END;
$$;

DROP POLICY IF EXISTS "Enable read access for all users on Gemini segment embeddings"
    ON public.segment_embedding_gemini;

REVOKE SELECT ON public.segment_embedding_gemini
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.segment_embedding_gemini
TO service_role;

CREATE OR REPLACE FUNCTION private.match_library_segments_gemini_internal(
    p_query_embedding extensions.vector(768),
    p_match_threshold double precision,
    p_match_count integer,
    p_user_id uuid,
    p_boost_completed boolean DEFAULT false
)
RETURNS TABLE(
    segment_id uuid,
    content_item_id uuid,
    similarity double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF auth.role() <> 'service_role'
       AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'cannot match another user''s library'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH scored_segments AS (
        SELECT
            seg.segment_id,
            seg.content_item_id,
            1 - (seg.embedding <=> p_query_embedding) AS base_similarity,
            CASE
                WHEN p_boost_completed
                  AND COALESCE((ul.progress->>'isCompleted')::boolean, false)
                    THEN LEAST((1 - (seg.embedding <=> p_query_embedding)) * 1.1, 1.0)
                ELSE 1 - (seg.embedding <=> p_query_embedding)
            END AS ranking_similarity
        FROM public.segment_embedding_gemini seg
        INNER JOIN public.user_library ul
            ON ul.content_id = seg.content_item_id
           AND ul.user_id = p_user_id
        INNER JOIN public.content_item ci
            ON ci.id = seg.content_item_id
        WHERE ci.status = 'verified'
          AND ci.deleted_at IS NULL
    )
    SELECT
        scored.segment_id,
        scored.content_item_id,
        scored.ranking_similarity AS similarity
    FROM scored_segments scored
    WHERE scored.base_similarity > p_match_threshold
    ORDER BY scored.ranking_similarity DESC, scored.base_similarity DESC
    LIMIT LEAST(GREATEST(COALESCE(p_match_count, 3), 1), 50);
END;
$$;

REVOKE EXECUTE ON FUNCTION private.match_library_segments_gemini_internal(
    extensions.vector(768),
    double precision,
    integer,
    uuid,
    boolean
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.match_library_segments_gemini_internal(
    extensions.vector(768),
    double precision,
    integer,
    uuid,
    boolean
)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.match_library_segments_gemini(
    query_embedding extensions.vector(768),
    match_threshold double precision,
    match_count integer,
    p_user_id uuid,
    p_boost_completed boolean DEFAULT false
)
RETURNS TABLE(
    segment_id uuid,
    content_item_id uuid,
    similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
    SELECT
        matched.segment_id,
        matched.content_item_id,
        matched.similarity
    FROM private.match_library_segments_gemini_internal(
        query_embedding,
        match_threshold,
        match_count,
        p_user_id,
        p_boost_completed
    ) matched;
$$;

REVOKE EXECUTE ON FUNCTION public.match_library_segments_gemini(
    extensions.vector(768),
    double precision,
    integer,
    uuid,
    boolean
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.match_library_segments_gemini(
    extensions.vector(768),
    double precision,
    integer,
    uuid,
    boolean
)
TO authenticated, service_role;
