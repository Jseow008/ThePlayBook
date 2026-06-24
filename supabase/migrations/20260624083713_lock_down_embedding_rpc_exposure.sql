-- Lock down embedding maintenance RPC execution while preserving the item 12
-- public-wrapper/private-helper matching path.

DO $$
DECLARE
    target regprocedure;
BEGIN
    FOR target IN
        SELECT p.oid::regprocedure
        FROM pg_proc p
        INNER JOIN pg_namespace n
            ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (
            (p.proname = 'get_segments_missing_embeddings' AND p.pronargs = 1)
            OR (p.proname = 'get_segments_missing_gemini_embeddings' AND p.pronargs = 1)
            OR (p.proname = 'get_gemini_segment_embedding_coverage' AND p.pronargs = 0)
          )
    LOOP
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
            target
        );
        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION %s TO service_role',
            target
        );
        EXECUTE format(
            'ALTER FUNCTION %s SET search_path = public',
            target
        );
    END LOOP;
END;
$$;

DO $$
DECLARE
    target regprocedure;
BEGIN
    FOR target IN
        SELECT p.oid::regprocedure
        FROM pg_proc p
        INNER JOIN pg_namespace n
            ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (
            (p.proname = 'match_library_segments' AND p.pronargs = 4)
            OR (p.proname = 'match_library_segments_gemini' AND p.pronargs = 5)
          )
    LOOP
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
            target
        );
        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',
            target
        );
        EXECUTE format(
            'ALTER FUNCTION %s SET search_path = public, extensions',
            target
        );
    END LOOP;
END;
$$;
