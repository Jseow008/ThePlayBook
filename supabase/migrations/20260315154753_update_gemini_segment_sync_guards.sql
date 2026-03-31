DROP FUNCTION IF EXISTS public.get_gemini_segment_embedding_coverage();

CREATE OR REPLACE FUNCTION public.get_segments_missing_gemini_embeddings(p_limit integer DEFAULT 50)
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
    LEFT JOIN public.segment_embedding_gemini seg
      ON seg.segment_id = s.id
    INNER JOIN public.content_item ci
      ON ci.id = s.item_id
    WHERE seg.segment_id IS NULL
      AND ci.deleted_at IS NULL
      AND ci.status = 'verified'
      AND s.deleted_at IS NULL
      AND NULLIF(BTRIM(s.markdown_body), '') IS NOT NULL
    ORDER BY s.created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

CREATE OR REPLACE FUNCTION public.get_gemini_segment_embedding_coverage()
RETURNS TABLE(
    total_library_content_items bigint,
    embedded_content_items bigint,
    missing_segments bigint,
    estimated_remaining_characters bigint
)
LANGUAGE sql
STABLE
AS $$
    WITH library_items AS (
        SELECT COUNT(DISTINCT ul.content_id) AS total_library_content_items
        FROM public.user_library ul
    ),
    embedded_items AS (
        SELECT COUNT(DISTINCT seg.content_item_id) AS embedded_content_items
        FROM public.segment_embedding_gemini seg
        INNER JOIN public.content_item ci ON ci.id = seg.content_item_id
        WHERE ci.deleted_at IS NULL
    ),
    missing AS (
        SELECT
            COUNT(*) AS missing_segments,
            COALESCE(SUM(CHAR_LENGTH(BTRIM(s.markdown_body))), 0) AS estimated_remaining_characters
        FROM public.segment s
        INNER JOIN public.content_item ci ON ci.id = s.item_id
        LEFT JOIN public.segment_embedding_gemini seg ON seg.segment_id = s.id
        WHERE ci.deleted_at IS NULL
          AND ci.status = 'verified'
          AND s.deleted_at IS NULL
          AND NULLIF(BTRIM(s.markdown_body), '') IS NOT NULL
          AND seg.segment_id IS NULL
    )
    SELECT
        library_items.total_library_content_items,
        embedded_items.embedded_content_items,
        missing.missing_segments,
        missing.estimated_remaining_characters
    FROM library_items, embedded_items, missing;
$$;

REVOKE EXECUTE ON FUNCTION public.get_segments_missing_gemini_embeddings(integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_segments_missing_gemini_embeddings(integer)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_gemini_segment_embedding_coverage()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gemini_segment_embedding_coverage()
TO service_role;
