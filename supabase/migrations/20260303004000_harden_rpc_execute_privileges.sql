-- Harden RPC function execution privileges and normalize search_path for
-- security definer functions.

-- Ensure security-definer functions resolve objects only from public.
ALTER FUNCTION public.get_homepage_sections_with_items(integer)
SET search_path = public;

ALTER FUNCTION public.admin_update_content_graph(uuid, jsonb, jsonb, jsonb)
SET search_path = public;

ALTER FUNCTION public.insert_generated_content(text, content_type, text, text, content_status, jsonb, jsonb)
SET search_path = public;

ALTER FUNCTION public.handle_new_user()
SET search_path = public;

ALTER FUNCTION public.is_admin()
SET search_path = public;

-- Admin-only RPCs (service role only)
REVOKE EXECUTE ON FUNCTION public.admin_update_content_graph(uuid, jsonb, jsonb, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_content_graph(uuid, jsonb, jsonb, jsonb)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_segments_missing_embeddings(integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_segments_missing_embeddings(integer)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.insert_generated_content(text, content_type, text, text, content_status, jsonb, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_generated_content(text, content_type, text, text, content_status, jsonb, jsonb)
TO service_role;

-- Public-read RPCs
REVOKE EXECUTE ON FUNCTION public.get_random_verified_content()
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_random_verified_content()
TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_homepage_sections_with_items(integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_homepage_sections_with_items(integer)
TO anon, authenticated, service_role;

-- Authenticated-only user-scoped RPCs
REVOKE EXECUTE ON FUNCTION public.increment_reading_activity(date, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_reading_activity(date, integer)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.match_library_segments(vector(1536), double precision, integer, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_library_segments(vector(1536), double precision, integer, uuid)
TO authenticated, service_role;

-- Utility helper should not be world-executable.
REVOKE EXECUTE ON FUNCTION public.is_admin()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin()
TO authenticated, service_role;
