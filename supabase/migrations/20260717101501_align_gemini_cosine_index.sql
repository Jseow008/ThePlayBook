-- DB-101: Gemini retrieval is defined in terms of cosine similarity (`<=>`).
-- Keep the query metric and HNSW operator class aligned so PostgreSQL can use
-- the vector index without changing the similarity contract.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

CREATE INDEX IF NOT EXISTS segment_embedding_gemini_embedding_cosine_idx
    ON public.segment_embedding_gemini
    USING hnsw (embedding extensions.vector_cosine_ops);

DROP INDEX IF EXISTS public.segment_embedding_gemini_embedding_idx;

ALTER INDEX public.segment_embedding_gemini_embedding_cosine_idx
    RENAME TO segment_embedding_gemini_embedding_idx;

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
SET hnsw.iterative_scan = 'strict_order'
SET hnsw.ef_search = '200'
SET enable_seqscan = off
AS $$
BEGIN
    IF auth.role() <> 'service_role'
       AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'cannot match another user''s library'
            USING ERRCODE = '42501';
    END IF;

    IF p_boost_completed THEN
        -- Completion boosting changes the sort expression. Preserve the exact
        -- existing ranking for this uncommon path rather than approximating it
        -- from an arbitrarily truncated HNSW candidate set.
        RETURN QUERY
        WITH scored_segments AS (
            SELECT
                seg.segment_id,
                seg.content_item_id,
                1 - (seg.embedding <=> p_query_embedding) AS base_similarity,
                CASE
                    WHEN COALESCE((ul.progress->>'isCompleted')::boolean, false)
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

        RETURN;
    END IF;

    -- Keep the distance expression directly in ascending ORDER BY form. This
    -- is the shape pgvector requires for a cosine HNSW index scan.
    RETURN QUERY
    SELECT
        seg.segment_id,
        seg.content_item_id,
        1 - (seg.embedding <=> p_query_embedding) AS similarity
    FROM public.segment_embedding_gemini seg
    INNER JOIN public.user_library ul
        ON ul.content_id = seg.content_item_id
       AND ul.user_id = p_user_id
    INNER JOIN public.content_item ci
        ON ci.id = seg.content_item_id
    WHERE ci.status = 'verified'
      AND ci.deleted_at IS NULL
      AND 1 - (seg.embedding <=> p_query_embedding) > p_match_threshold
    ORDER BY seg.embedding <=> p_query_embedding
    LIMIT LEAST(GREATEST(COALESCE(p_match_count, 3), 1), 50);
END;
$$;

COMMENT ON INDEX public.segment_embedding_gemini_embedding_idx IS
    'HNSW cosine index for Gemini segment retrieval using the <=> distance operator.';

COMMENT ON FUNCTION private.match_library_segments_gemini_internal(
    extensions.vector(768),
    double precision,
    integer,
    uuid,
    boolean
) IS
    'Authorized Gemini library retrieval. Uses cosine HNSW ordering for normal searches and exact completion-boosted reranking when requested.';

RESET statement_timeout;
RESET lock_timeout;
