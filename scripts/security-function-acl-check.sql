DO $$
DECLARE
  failures text;
BEGIN
  WITH allowed_public_definer_functions(function_name, arguments) AS (
    VALUES
      -- Token/email-scoped public RPCs used by unauthenticated email routes.
      -- These are intentionally callable by anon/authenticated but must remain
      -- exact-name/signature allowlist entries, fixed-search_path definers, and
      -- must not grant broad table privileges.
      ('subscribe_email_subscription', 'p_email text, p_source text, p_page_path text, p_referrer text, p_user_agent text, p_consent_text text, p_consent_version text'),
      ('unsubscribe_email_subscription_by_token', 'p_token text'),
      ('unsubscribe_request_published_notifications_by_token', 'p_token text')
  ),
  definer_functions AS (
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_function_result(p.oid) AS result_type,
      pg_get_functiondef(p.oid) AS definition,
      p.proconfig,
      EXISTS (
        SELECT 1
        FROM allowed_public_definer_functions allowed
        WHERE allowed.function_name = p.proname
          AND allowed.arguments = pg_get_function_identity_arguments(p.oid)
      ) AS is_allowed_public_definer
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
      AND NOT is_allowed_public_definer

    UNION ALL

    SELECT
      'executable_by_authenticated' AS violation,
      schema_name,
      function_name,
      arguments
    FROM definer_functions
    WHERE has_function_privilege('authenticated', oid, 'EXECUTE')
      AND NOT is_allowed_public_definer

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
      AND NOT is_allowed_public_definer
      AND NOT (
        definition ILIKE '%auth.role() <> ''service_role''%'
        OR definition ILIKE '%auth.role() != ''service_role''%'
      )

    UNION ALL

    SELECT
      'allowed_public_definer_missing_anon_execute' AS violation,
      schema_name,
      function_name,
      arguments
    FROM definer_functions
    WHERE is_allowed_public_definer
      AND NOT has_function_privilege('anon', oid, 'EXECUTE')

    UNION ALL

    SELECT
      'allowed_public_definer_missing_authenticated_execute' AS violation,
      schema_name,
      function_name,
      arguments
    FROM definer_functions
    WHERE is_allowed_public_definer
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')

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
