DO $$
DECLARE
  failures text;
BEGIN
  WITH expected_checks(check_name, passed) AS (
    VALUES
      (
        'anon_segment_embedding_select_revoked',
        COALESCE(
          NOT has_table_privilege('anon', to_regclass('public.segment_embedding'), 'select'),
          true
        )
      ),
      (
        'anon_segment_embedding_gemini_select_revoked',
        NOT has_table_privilege('anon', to_regclass('public.segment_embedding_gemini'), 'select')
      ),
      (
        'authenticated_segment_embedding_select_revoked',
        COALESCE(
          NOT has_table_privilege('authenticated', to_regclass('public.segment_embedding'), 'select'),
          true
        )
      ),
      (
        'authenticated_segment_embedding_gemini_select_revoked',
        NOT has_table_privilege('authenticated', to_regclass('public.segment_embedding_gemini'), 'select')
      ),
      (
        'service_role_segment_embedding_select_available',
        COALESCE(
          has_table_privilege('service_role', to_regclass('public.segment_embedding'), 'select'),
          true
        )
      ),
      (
        'service_role_segment_embedding_gemini_select_available',
        has_table_privilege('service_role', to_regclass('public.segment_embedding_gemini'), 'select')
      ),
      (
        'anon_private_schema_usage_revoked',
        NOT has_schema_privilege('anon', 'private', 'usage')
      ),
      (
        'authenticated_private_schema_usage_available',
        has_schema_privilege('authenticated', 'private', 'usage')
      )
  ),
  forbidden_policies AS (
    SELECT
      format(
        'forbidden_policy_still_exists: %I.%I policy %L',
        schemaname,
        tablename,
        policyname
      ) AS failure
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'segment_embedding'
          AND policyname = 'Enable read access for all users')
        OR
        (tablename = 'segment_embedding_gemini'
          AND policyname = 'Enable read access for all users on Gemini segment embeddings')
      )
  ),
  expected_private_helpers(function_name) AS (
    SELECT 'match_library_segments_gemini_internal'
    UNION ALL
    SELECT 'match_library_segments_internal'
    WHERE to_regclass('public.segment_embedding') IS NOT NULL
  ),
  private_helpers AS (
    SELECT
      expected.function_name AS expected_function_name,
      p.oid,
      p.proname AS function_name,
      p.arguments,
      p.definition,
      p.proconfig,
      p.prosecdef
    FROM expected_private_helpers expected
    LEFT JOIN (
      SELECT
        p.oid,
        p.proname,
        pg_get_function_identity_arguments(p.oid) AS arguments,
        pg_get_functiondef(p.oid) AS definition,
        p.proconfig,
        p.prosecdef
      FROM pg_proc p
      INNER JOIN pg_namespace n
        ON n.oid = p.pronamespace
      WHERE n.nspname = 'private'
    ) p
      ON p.proname = expected.function_name
  ),
  helper_violations AS (
    SELECT
      format('missing_private_helper: private.%I', expected_function_name) AS failure
    FROM private_helpers
    WHERE oid IS NULL

    UNION ALL

    SELECT
      format('private_helper_not_security_definer: private.%I(%s)', function_name, arguments)
    FROM private_helpers
    WHERE oid IS NOT NULL
      AND prosecdef IS NOT TRUE

    UNION ALL

    SELECT
      format('private_helper_executable_by_anon: private.%I(%s)', function_name, arguments)
    FROM private_helpers
    WHERE oid IS NOT NULL
      AND has_function_privilege('anon', oid, 'EXECUTE')

    UNION ALL

    SELECT
      format('private_helper_missing_authenticated_execute: private.%I(%s)', function_name, arguments)
    FROM private_helpers
    WHERE oid IS NOT NULL
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')

    UNION ALL

    SELECT
      format('private_helper_missing_service_role_execute: private.%I(%s)', function_name, arguments)
    FROM private_helpers
    WHERE oid IS NOT NULL
      AND NOT has_function_privilege('service_role', oid, 'EXECUTE')

    UNION ALL

    SELECT
      format('private_helper_missing_fixed_search_path: private.%I(%s)', function_name, arguments)
    FROM private_helpers
    WHERE oid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS cfg(value)
        WHERE cfg.value LIKE 'search_path=%'
      )

    UNION ALL

    SELECT
      format('private_helper_missing_user_boundary: private.%I(%s)', function_name, arguments)
    FROM private_helpers
    WHERE oid IS NOT NULL
      AND NOT (
        definition ILIKE '%auth.role() <> ''service_role''%'
        AND definition ILIKE '%p_user_id IS DISTINCT FROM auth.uid()%'
      )

    UNION ALL

    SELECT
      format('private_helper_missing_verified_content_filter: private.%I(%s)', function_name, arguments)
    FROM private_helpers
    WHERE oid IS NOT NULL
      AND NOT (
        definition ILIKE '%ci.status = ''verified''%'
        AND definition ILIKE '%ci.deleted_at IS NULL%'
      )
  ),
  public_rpc_violations AS (
    SELECT
      format('public_match_rpc_executable_by_anon: public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS failure
    FROM pg_proc p
    INNER JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('match_library_segments', 'match_library_segments_gemini')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  expected_embedding_rpcs(function_name, pronargs, access_model, required) AS (
    VALUES
      ('get_segments_missing_embeddings', 1, 'service_only', false),
      ('get_segments_missing_gemini_embeddings', 1, 'service_only', true),
      ('get_gemini_segment_embedding_coverage', 0, 'service_only', true),
      ('match_library_segments', 4, 'user_match', false),
      ('match_library_segments_gemini', 5, 'user_match', true)
  ),
  embedding_rpcs AS (
    SELECT
      expected.function_name AS expected_function_name,
      expected.pronargs AS expected_pronargs,
      expected.access_model,
      expected.required,
      p.oid,
      p.proname AS function_name,
      p.arguments,
      p.proconfig
    FROM expected_embedding_rpcs expected
    LEFT JOIN LATERAL (
      SELECT
        p.oid,
        p.proname,
        pg_get_function_identity_arguments(p.oid) AS arguments,
        p.proconfig
      FROM pg_proc p
      INNER JOIN pg_namespace n
        ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = expected.function_name
        AND p.pronargs = expected.pronargs
      ORDER BY p.oid
      LIMIT 1
    ) p
      ON true
  ),
  embedding_rpc_violations AS (
    SELECT
      format('missing_required_embedding_rpc: public.%I/%s args', expected_function_name, expected_pronargs) AS failure
    FROM embedding_rpcs
    WHERE required
      AND oid IS NULL

    UNION ALL

    SELECT
      format('service_only_embedding_rpc_executable_by_anon: public.%I(%s)', function_name, arguments)
    FROM embedding_rpcs
    WHERE oid IS NOT NULL
      AND access_model = 'service_only'
      AND has_function_privilege('anon', oid, 'EXECUTE')

    UNION ALL

    SELECT
      format('service_only_embedding_rpc_executable_by_authenticated: public.%I(%s)', function_name, arguments)
    FROM embedding_rpcs
    WHERE oid IS NOT NULL
      AND access_model = 'service_only'
      AND has_function_privilege('authenticated', oid, 'EXECUTE')

    UNION ALL

    SELECT
      format('service_only_embedding_rpc_missing_service_role_execute: public.%I(%s)', function_name, arguments)
    FROM embedding_rpcs
    WHERE oid IS NOT NULL
      AND access_model = 'service_only'
      AND NOT has_function_privilege('service_role', oid, 'EXECUTE')

    UNION ALL

    SELECT
      format('user_match_embedding_rpc_executable_by_anon: public.%I(%s)', function_name, arguments)
    FROM embedding_rpcs
    WHERE oid IS NOT NULL
      AND access_model = 'user_match'
      AND has_function_privilege('anon', oid, 'EXECUTE')

    UNION ALL

    SELECT
      format('user_match_embedding_rpc_missing_authenticated_execute: public.%I(%s)', function_name, arguments)
    FROM embedding_rpcs
    WHERE oid IS NOT NULL
      AND access_model = 'user_match'
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')

    UNION ALL

    SELECT
      format('user_match_embedding_rpc_missing_service_role_execute: public.%I(%s)', function_name, arguments)
    FROM embedding_rpcs
    WHERE oid IS NOT NULL
      AND access_model = 'user_match'
      AND NOT has_function_privilege('service_role', oid, 'EXECUTE')

    UNION ALL

    SELECT
      format('embedding_rpc_missing_fixed_search_path: public.%I(%s)', function_name, arguments)
    FROM embedding_rpcs
    WHERE oid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS cfg(value)
        WHERE cfg.value LIKE 'search_path=%'
      )
  ),
  all_failures AS (
    SELECT check_name AS failure
    FROM expected_checks
    WHERE NOT passed

    UNION ALL

    SELECT failure
    FROM forbidden_policies

    UNION ALL

    SELECT failure
    FROM helper_violations

    UNION ALL

    SELECT failure
    FROM public_rpc_violations

    UNION ALL

    SELECT failure
    FROM embedding_rpc_violations
  )
  SELECT string_agg(failure, E'\n' ORDER BY failure)
  INTO failures
  FROM all_failures;

  IF failures IS NOT NULL THEN
    RAISE EXCEPTION 'Embedding table read security drift detected:%', E'\n' || failures;
  END IF;
END;
$$;
