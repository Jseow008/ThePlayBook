DO $$
DECLARE
  failures text;
BEGIN
  WITH expected_admin_functions(function_name, arguments) AS (
    VALUES
      ('admin_update_content_graph', 'p_content_id uuid, p_content_patch jsonb, p_segments jsonb, p_artifacts jsonb'),
      ('admin_finalize_narration_generation', 'p_content_id uuid, p_expected_started_at timestamp with time zone, p_audio_url text, p_completed_at timestamp with time zone, p_segment_timings jsonb')
  ),
  admin_functions AS (
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p
    INNER JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'admin\_%' ESCAPE '\'
  ),
  missing_expected_functions AS (
    SELECT
      'missing_expected_admin_rpc' AS violation,
      'public' AS schema_name,
      expected.function_name,
      expected.arguments
    FROM expected_admin_functions expected
    LEFT JOIN admin_functions existing
      ON existing.function_name = expected.function_name
     AND existing.arguments = expected.arguments
    WHERE existing.oid IS NULL
  ),
  privilege_violations AS (
    SELECT
      format('admin_rpc_executable_by_%s', role_name) AS violation,
      schema_name,
      function_name,
      arguments
    FROM admin_functions
    CROSS JOIN (
      VALUES
        ('anon'),
        ('authenticated')
    ) AS roles(role_name)
    WHERE has_function_privilege(role_name, oid, 'EXECUTE')

    UNION ALL

    SELECT
      'admin_rpc_executable_by_PUBLIC' AS violation,
      schema_name,
      function_name,
      arguments
    FROM admin_functions
    WHERE EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(
        (SELECT proacl FROM pg_proc WHERE oid = admin_functions.oid),
        acldefault('f', (SELECT proowner FROM pg_proc WHERE oid = admin_functions.oid))
      )) AS acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    )

    UNION ALL

    SELECT
      'admin_rpc_not_executable_by_service_role' AS violation,
      schema_name,
      function_name,
      arguments
    FROM admin_functions
    WHERE NOT has_function_privilege('service_role', oid, 'EXECUTE')
  ),
  violations AS (
    SELECT * FROM missing_expected_functions
    UNION ALL
    SELECT * FROM privilege_violations
  )
  SELECT string_agg(
    format(
      '%s: %I.%I(%s)',
      violation,
      schema_name,
      function_name,
      arguments
    ),
    E'\n'
    ORDER BY violation, schema_name, function_name, arguments
  )
  INTO failures
  FROM violations;

  IF failures IS NOT NULL THEN
    RAISE EXCEPTION 'Supabase admin RPC ACL drift detected:%', E'\n' || failures;
  END IF;
END;
$$;
