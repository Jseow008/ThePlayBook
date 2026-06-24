-- Document and enforce service-only analytics/embedding storage tables.
-- These tables are written by service-role guarded RPCs or admin jobs only.
-- Public client roles should not be able to read or mutate them directly,
-- even if RLS is accidentally changed later.

COMMENT ON TABLE public.content_reading_activity IS
    'Service-only content analytics aggregate table. Direct public client access is intentionally denied; writes happen through service-role guarded activity RPCs and reads through admin/service-role paths.';

COMMENT ON TABLE public.content_reader_daily IS
    'Service-only per-user content reader dedupe table. Direct public client access is intentionally denied; writes happen through service-role guarded activity RPCs.';

COMMENT ON TABLE public.content_reader_visitor_daily IS
    'Service-only anonymous visitor content reader dedupe table. Direct public client access is intentionally denied; writes happen through service-role guarded activity RPCs.';

COMMENT ON TABLE public.segment_embedding_gemini IS
    'Service-only Gemini segment embedding table. Direct public client access is intentionally denied; reads happen through guarded vector match RPCs and maintenance happens through service-role/admin jobs.';

REVOKE ALL ON TABLE public.content_reading_activity
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.content_reader_daily
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.content_reader_visitor_daily
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.segment_embedding_gemini
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_reading_activity
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_reader_daily
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_reader_visitor_daily
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.segment_embedding_gemini
TO service_role;

DROP POLICY IF EXISTS "Service-only analytics table: deny public access"
    ON public.content_reading_activity;

CREATE POLICY "Service-only analytics table: deny public access"
ON public.content_reading_activity
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Service-only analytics table: deny public access"
    ON public.content_reader_daily;

CREATE POLICY "Service-only analytics table: deny public access"
ON public.content_reader_daily
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Service-only analytics table: deny public access"
    ON public.content_reader_visitor_daily;

CREATE POLICY "Service-only analytics table: deny public access"
ON public.content_reader_visitor_daily
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Service-only embedding table: deny public access"
    ON public.segment_embedding_gemini;

CREATE POLICY "Service-only embedding table: deny public access"
ON public.segment_embedding_gemini
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
