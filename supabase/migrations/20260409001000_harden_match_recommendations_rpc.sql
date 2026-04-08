-- Replace the legacy overload and explicitly harden the public recommendation RPC.

DROP FUNCTION IF EXISTS public.match_recommendations(uuid[], integer);

ALTER FUNCTION public.match_recommendations(uuid[], uuid[], integer)
SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.match_recommendations(uuid[], uuid[], integer)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.match_recommendations(uuid[], uuid[], integer)
TO anon, authenticated, service_role;
