CREATE OR REPLACE FUNCTION public.get_gemini_segment_embedding_coverage()
RETURNS TABLE(
    total_library_content_items bigint,
    embedded_content_items bigint,
    missing_segments bigint
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
    ),
    missing AS (
        SELECT COUNT(*) AS missing_segments
        FROM public.segment s
        INNER JOIN public.content_item ci ON ci.id = s.item_id
        LEFT JOIN public.segment_embedding_gemini seg ON seg.segment_id = s.id
        WHERE ci.deleted_at IS NULL
          AND ci.status = 'verified'
          AND seg.segment_id IS NULL
    )
    SELECT
        library_items.total_library_content_items,
        embedded_items.embedded_content_items,
        missing.missing_segments
    FROM library_items, embedded_items, missing;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gemini_segment_embedding_coverage()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gemini_segment_embedding_coverage()
TO service_role;
