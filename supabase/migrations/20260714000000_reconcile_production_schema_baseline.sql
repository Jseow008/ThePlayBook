-- Reproduce the verified production baseline after historical migrations were
-- applied partly through direct SQL. This migration is intentionally
-- idempotent for production and fail-closed for any environment that contains
-- legacy segment_embedding data.

DROP FUNCTION IF EXISTS public.match_library_segments(
    extensions.vector(1536),
    double precision,
    integer,
    uuid
);

DROP FUNCTION IF EXISTS private.match_library_segments_internal(
    extensions.vector(1536),
    double precision,
    integer,
    uuid
);

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
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT
    se.segment_id,
    se.content_item_id,
    1 - (se.embedding <=> query_embedding) AS similarity
  FROM segment_embedding se
  INNER JOIN user_library ul ON ul.content_id = se.content_item_id
  WHERE ul.user_id = p_user_id AND 1 - (se.embedding <=> query_embedding) > match_threshold
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
$function$;

REVOKE EXECUTE ON FUNCTION public.match_library_segments(
    extensions.vector(1536),
    double precision,
    integer,
    uuid
)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.match_library_segments(
    extensions.vector(1536),
    double precision,
    integer,
    uuid
)
TO authenticated, service_role;

DO $reconciliation$
DECLARE
    legacy_rows_exist boolean;
BEGIN
    IF to_regclass('public.segment_embedding') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.segment_embedding)'
        INTO legacy_rows_exist;

        IF legacy_rows_exist THEN
            RAISE EXCEPTION
                'Refusing to remove non-empty public.segment_embedding during reconciliation';
        END IF;

        DROP TABLE public.segment_embedding;
    END IF;
END;
$reconciliation$;

-- The check is absent from production because version 004 ran against a
-- pre-existing table. Constraint design and rollout remain tracked by DB-105.
ALTER TABLE public.homepage_section
DROP CONSTRAINT IF EXISTS homepage_section_filter_type_check;

-- Preserve the current public-read RPC posture. Least-privilege function ACL
-- tightening remains tracked by DB-106.
GRANT EXECUTE ON FUNCTION public.get_random_verified_content() TO PUBLIC;

-- Supabase projects created under the older API-exposure defaults granted all
-- table privileges to API roles. Capture those current production ACLs
-- explicitly so a fresh project created under newer defaults behaves the same.
GRANT ALL PRIVILEGES ON TABLE
    public.admin_content_workbench_readiness,
    public.ai_message_usage,
    public.artifact,
    public.content_feedback,
    public.content_item,
    public.content_request_notifications,
    public.content_request_votes,
    public.content_requests,
    public.content_series,
    public.homepage_section,
    public.profiles,
    public.reading_activity,
    public.segment,
    public.user_highlights,
    public.user_library
TO anon, authenticated, service_role;

REVOKE SELECT ON TABLE public.admin_content_workbench_readiness
FROM anon, authenticated;

REVOKE UPDATE ON TABLE public.profiles
FROM anon, authenticated;
