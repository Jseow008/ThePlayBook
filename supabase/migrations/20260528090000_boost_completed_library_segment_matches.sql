-- Allow Ask My Library advisor queries to rank completed-user-library items
-- slightly higher without changing the hard user-library scope.

DROP FUNCTION IF EXISTS public.match_library_segments_gemini(vector(768), double precision, integer, uuid);

CREATE OR REPLACE FUNCTION public.match_library_segments_gemini(
    query_embedding vector(768),
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
AS $$
    WITH scored_segments AS (
        SELECT
            seg.segment_id,
            seg.content_item_id,
            1 - (seg.embedding <=> query_embedding) AS base_similarity,
            CASE
                WHEN p_boost_completed
                  AND COALESCE((ul.progress->>'isCompleted')::boolean, false)
                    THEN LEAST((1 - (seg.embedding <=> query_embedding)) * 1.1, 1.0)
                ELSE 1 - (seg.embedding <=> query_embedding)
            END AS ranking_similarity
        FROM public.segment_embedding_gemini seg
        INNER JOIN public.user_library ul ON ul.content_id = seg.content_item_id
        WHERE ul.user_id = p_user_id
    )
    SELECT
        segment_id,
        content_item_id,
        ranking_similarity AS similarity
    FROM scored_segments
    WHERE base_similarity > match_threshold
    ORDER BY ranking_similarity DESC, base_similarity DESC
    LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.match_library_segments_gemini(vector(768), double precision, integer, uuid, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_library_segments_gemini(vector(768), double precision, integer, uuid, boolean)
TO authenticated, service_role;
