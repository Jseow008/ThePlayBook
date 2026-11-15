-- Requests are an admin queue, not a public board. Preserve service and snapshot-worker access.
DROP POLICY IF EXISTS "Anyone can view visible content requests" ON public.content_requests;
REVOKE SELECT ON public.content_requests FROM anon, authenticated;
