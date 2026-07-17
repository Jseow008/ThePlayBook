-- Retire the pre-Gemini embedding API. The application switched to the
-- 768-dimensional Gemini workflow in March 2026, and the legacy 1536-dimensional
-- table is already absent from production. Keep the migration fail-closed if an
-- unexpected environment still contains legacy embedding data.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

DO $retirement_guard$
DECLARE
    legacy_rows_exist boolean;
BEGIN
    IF to_regclass('public.segment_embedding') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.segment_embedding)'
        INTO legacy_rows_exist;

        IF legacy_rows_exist THEN
            RAISE EXCEPTION
                'Refusing to retire non-empty public.segment_embedding';
        END IF;
    END IF;
END;
$retirement_guard$;

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

DROP FUNCTION IF EXISTS public.get_segments_missing_embeddings(integer);

DROP INDEX IF EXISTS public.segment_embedding_embedding_idx;
DROP INDEX IF EXISTS public.segment_embedding_segment_id_key;
DROP TABLE IF EXISTS public.segment_embedding RESTRICT;
