DO $$
DECLARE
  failures text;
BEGIN
  WITH expected_service_only_tables(table_name, expected_policy, expected_comment_fragment) AS (
    VALUES
      (
        'content_reading_activity',
        'Service-only analytics table: deny public access',
        'Service-only content analytics aggregate table'
      ),
      (
        'content_reader_daily',
        'Service-only analytics table: deny public access',
        'Service-only per-user content reader dedupe table'
      ),
      (
        'content_reader_visitor_daily',
        'Service-only analytics table: deny public access',
        'Service-only anonymous visitor content reader dedupe table'
      ),
      (
        'segment_embedding_gemini',
        'Service-only embedding table: deny public access',
        'Service-only Gemini segment embedding table'
      )
  ),
  expected_activity_rpcs(function_name, arguments) AS (
    VALUES
      ('increment_reading_activity_for_user', 'p_activity_date date, p_duration_seconds integer, p_user_id uuid'),
      ('log_anonymous_reading_activity', 'p_activity_date date, p_duration_seconds integer, p_content_id uuid, p_visitor_id text'),
      ('log_reading_activity', 'p_activity_date date, p_duration_seconds integer, p_content_id uuid'),
      ('log_reading_activity_for_user', 'p_activity_date date, p_duration_seconds integer, p_content_id uuid, p_user_id uuid')
  ),
  expected_table_details AS (
    SELECT
      expected.table_name,
      expected.expected_policy,
      expected.expected_comment_fragment,
      c.oid AS table_oid,
      c.relrowsecurity,
      obj_description(c.oid, 'pg_class') AS table_comment
    FROM expected_service_only_tables expected
    LEFT JOIN pg_class c
      ON c.relname = expected.table_name
     AND c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p')
  ),
  missing_tables AS (
    SELECT format('missing_expected_service_only_table: public.%I', table_name) AS failure
    FROM expected_table_details
    WHERE table_oid IS NULL
  ),
  rls_violations AS (
    SELECT format('rls_not_enabled: public.%I', table_name) AS failure
    FROM expected_table_details
    WHERE table_oid IS NOT NULL
      AND relrowsecurity IS NOT TRUE
  ),
  comment_violations AS (
    SELECT format('missing_service_only_table_comment: public.%I', table_name) AS failure
    FROM expected_table_details
    WHERE table_oid IS NOT NULL
      AND COALESCE(table_comment, '') NOT ILIKE '%' || expected_comment_fragment || '%'
  ),
  policy_violations AS (
    SELECT format('missing_deny_all_policy: public.%I', expected.table_name) AS failure
    FROM expected_table_details expected
    WHERE expected.table_oid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policies policy
        WHERE policy.schemaname = 'public'
          AND policy.tablename = expected.table_name
          AND policy.policyname = expected.expected_policy
          AND policy.cmd = 'ALL'
          AND ARRAY['anon', 'authenticated']::name[] <@ policy.roles
          AND policy.qual = 'false'
          AND policy.with_check = 'false'
      )
  ),
  public_table_privilege_violations AS (
    SELECT
      format(
        'public_client_table_privilege: %s can %s public.%I',
        role_name,
        privilege_name,
        table_name
      ) AS failure
    FROM expected_table_details
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS privileges(privilege_name)
    WHERE table_oid IS NOT NULL
      AND has_table_privilege(role_name, table_oid, privilege_name)
  ),
  service_table_privilege_violations AS (
    SELECT
      format('service_role_missing_table_privilege: %s public.%I', privilege_name, table_name) AS failure
    FROM expected_table_details
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS privileges(privilege_name)
    WHERE table_oid IS NOT NULL
      AND NOT has_table_privilege('service_role', table_oid, privilege_name)
  ),
  policyless_public_rls_tables AS (
    SELECT
      format('public_rls_enabled_table_without_policy: public.%I', c.relname) AS failure
    FROM pg_class c
    INNER JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_policies policy
      ON policy.schemaname = n.nspname
     AND policy.tablename = c.relname
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity IS TRUE
    GROUP BY c.relname
    HAVING count(policy.policyname) = 0
  ),
  activity_rpcs AS (
    SELECT
      expected.function_name,
      expected.arguments,
      p.oid,
      p.prosecdef,
      p.proconfig
    FROM expected_activity_rpcs expected
    LEFT JOIN pg_proc p
      ON p.proname = expected.function_name
     AND p.pronamespace = 'public'::regnamespace
     AND pg_get_function_identity_arguments(p.oid) = expected.arguments
  ),
  activity_rpc_violations AS (
    SELECT format('missing_activity_rpc: public.%I(%s)', function_name, arguments) AS failure
    FROM activity_rpcs
    WHERE oid IS NULL

    UNION ALL

    SELECT format('activity_rpc_not_security_definer: public.%I(%s)', function_name, arguments) AS failure
    FROM activity_rpcs
    WHERE oid IS NOT NULL
      AND prosecdef IS NOT TRUE

    UNION ALL

    SELECT format('activity_rpc_missing_fixed_search_path: public.%I(%s)', function_name, arguments) AS failure
    FROM activity_rpcs
    WHERE oid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS cfg(value)
        WHERE cfg.value LIKE 'search_path=%'
      )

    UNION ALL

    SELECT format('activity_rpc_executable_by_anon: public.%I(%s)', function_name, arguments) AS failure
    FROM activity_rpcs
    WHERE oid IS NOT NULL
      AND has_function_privilege('anon', oid, 'EXECUTE')

    UNION ALL

    SELECT format('activity_rpc_executable_by_authenticated: public.%I(%s)', function_name, arguments) AS failure
    FROM activity_rpcs
    WHERE oid IS NOT NULL
      AND has_function_privilege('authenticated', oid, 'EXECUTE')

    UNION ALL

    SELECT format('activity_rpc_not_executable_by_service_role: public.%I(%s)', function_name, arguments) AS failure
    FROM activity_rpcs
    WHERE oid IS NOT NULL
      AND NOT has_function_privilege('service_role', oid, 'EXECUTE')
  ),
  all_failures AS (
    SELECT failure FROM missing_tables
    UNION ALL
    SELECT failure FROM rls_violations
    UNION ALL
    SELECT failure FROM comment_violations
    UNION ALL
    SELECT failure FROM policy_violations
    UNION ALL
    SELECT failure FROM public_table_privilege_violations
    UNION ALL
    SELECT failure FROM service_table_privilege_violations
    UNION ALL
    SELECT failure FROM policyless_public_rls_tables
    UNION ALL
    SELECT failure FROM activity_rpc_violations
  )
  SELECT string_agg(failure, E'\n' ORDER BY failure)
  INTO failures
  FROM all_failures;

  IF failures IS NOT NULL THEN
    RAISE EXCEPTION 'Analytics RLS security drift detected:%', E'\n' || failures;
  END IF;
END;
$$;
