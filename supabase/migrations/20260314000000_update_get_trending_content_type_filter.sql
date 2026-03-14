-- RPC: get_trending_content
-- Adds optional type filtering so empty-state type tabs stay lightweight.

DROP FUNCTION IF EXISTS public.get_trending_content(int);

CREATE OR REPLACE FUNCTION public.get_trending_content(
    p_limit int DEFAULT 10,
    p_type public.content_type DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    type public.content_type,
    title text,
    author text,
    category text,
    cover_image_url text,
    duration_seconds int,
    created_at timestamptz,
    quick_mode_json jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        ci.id,
        ci.type,
        ci.title,
        ci.author,
        ci.category,
        ci.cover_image_url,
        ci.duration_seconds,
        ci.created_at,
        ci.quick_mode_json
    FROM public.content_item ci
    LEFT JOIN (
        SELECT content_id, COUNT(DISTINCT user_id) AS reader_count, MAX(last_interacted_at) AS latest_interaction
        FROM public.user_library
        GROUP BY content_id
    ) ul ON ul.content_id = ci.id
    WHERE ci.status = 'verified'
      AND ci.deleted_at IS NULL
      AND (p_type IS NULL OR ci.type = p_type)
    ORDER BY COALESCE(ul.reader_count, 0) DESC, COALESCE(ul.latest_interaction, ci.created_at) DESC
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_content(int, public.content_type) TO anon;
GRANT EXECUTE ON FUNCTION public.get_trending_content(int, public.content_type) TO authenticated;
