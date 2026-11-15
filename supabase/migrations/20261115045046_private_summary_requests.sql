-- Requests are an admin queue, not a public board. Preserve service and snapshot-worker access.
DROP POLICY IF EXISTS "Anyone can view visible content requests" ON public.content_requests;
REVOKE ALL PRIVILEGES ON public.content_requests FROM PUBLIC, anon, authenticated;
