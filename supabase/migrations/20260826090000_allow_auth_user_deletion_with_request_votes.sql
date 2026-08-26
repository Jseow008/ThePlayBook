-- Auth-owned cascades run as supabase_auth_admin. A vote deletion invokes this
-- trigger function, which must retain the privileges needed to update the
-- cached request vote count.
ALTER FUNCTION public.update_content_request_vote_count()
SECURITY DEFINER
SET search_path = public;

-- Trigger functions are not application RPCs. Keep them unavailable for direct
-- calls by browser-facing roles while allowing the trigger to execute.
REVOKE ALL ON FUNCTION public.update_content_request_vote_count()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_content_request_vote_count()
TO service_role;
