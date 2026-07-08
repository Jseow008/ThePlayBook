CREATE OR REPLACE FUNCTION public.get_admin_ai_readiness_summary()
RETURNS TABLE (
    verified_items integer,
    ai_ready_items integer,
    ai_stale_items integer,
    stale_content_embeddings integer,
    stale_segment_embeddings integer,
    items_without_published_segments integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'get_admin_ai_readiness_summary requires service role';
    END IF;

    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE ai_status <> 'not_applicable')::integer AS verified_items,
        COUNT(*) FILTER (WHERE ai_status = 'ready')::integer AS ai_ready_items,
        COUNT(*) FILTER (WHERE ai_status = 'stale')::integer AS ai_stale_items,
        COUNT(*) FILTER (
            WHERE ai_status <> 'not_applicable'
              AND NOT has_content_embedding
        )::integer AS stale_content_embeddings,
        COUNT(*) FILTER (
            WHERE ai_status <> 'not_applicable'
              AND (
                  total_segments = 0
                  OR embedded_segments < total_segments
              )
        )::integer AS stale_segment_embeddings,
        COUNT(*) FILTER (
            WHERE ai_status <> 'not_applicable'
              AND total_segments = 0
        )::integer AS items_without_published_segments
    FROM public.admin_content_workbench_readiness
    WHERE status = 'verified'
      AND deleted_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_ai_readiness_summary()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_ai_readiness_summary()
TO service_role;
