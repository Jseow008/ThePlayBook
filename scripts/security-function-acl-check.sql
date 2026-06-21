DO $$
DECLARE
  failures text;
BEGIN
  WITH definer_functions AS (
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_function_result(p.oid) AS result_type,
      pg_get_functiondef(p.oid) AS definition,
      p.proconfig
    FROM pg_proc p
    INNER JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  ),
  trigger_functions AS (
    SELECT DISTINCT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p
    INNER JOIN pg_namespace n ON n.oid = p.pronamespace
    INNER JOIN pg_trigger t ON t.tgfoid = p.oid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
  ),
  violations AS (
    SELECT
      'executable_by_anon' AS violation,
      schema_name,
      function_name,
      arguments
    FROM definer_functions
    WHERE has_function_privilege('anon', oid, 'EXECUTE')

    UNION ALL

    SELECT
      'executable_by_authenticated' AS violation,
      schema_name,
      function_name,
      arguments
    FROM definer_functions
    WHERE has_function_privilege('authenticated', oid, 'EXECUTE')

    UNION ALL

    SELECT
      'missing_fixed_search_path' AS violation,
      schema_name,
      function_name,
      arguments
    FROM definer_functions
    WHERE NOT EXISTS (
      SELECT 1
      FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS cfg(value)
      WHERE cfg.value LIKE 'search_path=%'
    )

    UNION ALL

    SELECT
      'definer_rpc_missing_service_role_guard' AS violation,
      schema_name,
      function_name,
      arguments
    FROM definer_functions
    WHERE result_type <> 'trigger'
      AND NOT (
        definition ILIKE '%auth.role() <> ''service_role''%'
        OR definition ILIKE '%auth.role() != ''service_role''%'
      )

    UNION ALL

    SELECT
      'trigger_function_executable_by_anon' AS violation,
      schema_name,
      function_name,
      arguments
    FROM trigger_functions
    WHERE has_function_privilege('anon', oid, 'EXECUTE')

    UNION ALL

    SELECT
      'trigger_function_executable_by_authenticated' AS violation,
      schema_name,
      function_name,
      arguments
    FROM trigger_functions
    WHERE has_function_privilege('authenticated', oid, 'EXECUTE')
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
    RAISE EXCEPTION 'Supabase SECURITY DEFINER ACL drift detected:%', E'\n' || failures;
  END IF;
END;
$$;
