-- DB-102 role smoke test. Run only against local or disposable databases.

DO $db102$
DECLARE
  v_user_id uuid := 'db102000-0000-4000-8000-000000000001';
  v_query extensions.vector(768) := pg_catalog.array_fill(0.0::real, ARRAY[768])::extensions.vector;
BEGIN
  IF to_regclass('public.segment_embedding') IS NOT NULL THEN
    RAISE EXCEPTION 'DB-102 smoke found legacy segment_embedding';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.proname IN (
        'get_segments_missing_embeddings',
        'match_library_segments',
        'match_library_segments_internal'
      )
  ) THEN
    RAISE EXCEPTION 'DB-102 smoke found a legacy embedding RPC';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM *
  FROM public.match_library_segments_gemini(
    v_query,
    -1.0,
    1,
    v_user_id,
    false
  );

  EXECUTE 'RESET ROLE';
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  EXECUTE 'SET LOCAL ROLE service_role';

  PERFORM * FROM public.get_segments_missing_gemini_embeddings(1);
  PERFORM * FROM public.get_gemini_segment_embedding_coverage();

  EXECUTE 'RESET ROLE';
END;
$db102$;
