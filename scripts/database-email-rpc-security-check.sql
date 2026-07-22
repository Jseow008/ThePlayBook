-- DB-106 role and behavior proof. Run only against local or disposable databases.

DO $db106$
DECLARE
  failures text;
  email_default text;
  preference_default text;
  existing_token text;
  missing_token text := pg_catalog.repeat('f', 64);
BEGIN
  WITH expected(function_name, arguments) AS (
    VALUES
      ('subscribe_email_subscription', 'p_email text, p_source text, p_page_path text, p_referrer text, p_user_agent text, p_consent_text text, p_consent_version text'),
      ('unsubscribe_email_subscription_by_token', 'p_token text'),
      ('unsubscribe_request_published_notifications_by_token', 'p_token text')
  ),
  actual AS (
    SELECT
      p.oid,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      p.prosecdef,
      p.proconfig
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (SELECT function_name FROM expected)
  ),
  violations AS (
    SELECT 'missing_or_unexpected_signature' AS violation, e.function_name, e.arguments
    FROM expected e
    LEFT JOIN actual a
      ON a.function_name = e.function_name
     AND a.arguments = e.arguments
    WHERE a.oid IS NULL

    UNION ALL

    SELECT 'not_security_definer', function_name, arguments
    FROM actual
    WHERE NOT prosecdef

    UNION ALL

    SELECT 'missing_fixed_search_path', function_name, arguments
    FROM actual
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(proconfig, ARRAY[]::text[])) AS cfg(value)
      WHERE cfg.value = 'search_path=public'
    )

    UNION ALL

    SELECT 'anon_execute', function_name, arguments
    FROM actual
    WHERE has_function_privilege('anon', oid, 'EXECUTE')

    UNION ALL

    SELECT 'authenticated_execute', function_name, arguments
    FROM actual
    WHERE has_function_privilege('authenticated', oid, 'EXECUTE')

    UNION ALL

    SELECT 'service_role_missing_execute', function_name, arguments
    FROM actual
    WHERE NOT has_function_privilege('service_role', oid, 'EXECUTE')
  )
  SELECT pg_catalog.string_agg(
    pg_catalog.format('%s: %I(%s)', violation, function_name, arguments),
    E'\n'
    ORDER BY violation, function_name
  )
  INTO failures
  FROM violations;

  IF failures IS NOT NULL THEN
    RAISE EXCEPTION 'DB-106 ACL check failed:%', E'\n' || failures;
  END IF;

  SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid)
  INTO email_default
  FROM pg_catalog.pg_attrdef d
  INNER JOIN pg_catalog.pg_class c ON c.oid = d.adrelid
  INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  INNER JOIN pg_catalog.pg_attribute a
    ON a.attrelid = c.oid
   AND a.attnum = d.adnum
  WHERE n.nspname = 'public'
    AND c.relname = 'email_subscription'
    AND a.attname = 'unsubscribe_token';

  SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid)
  INTO preference_default
  FROM pg_catalog.pg_attrdef d
  INNER JOIN pg_catalog.pg_class c ON c.oid = d.adrelid
  INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  INNER JOIN pg_catalog.pg_attribute a
    ON a.attrelid = c.oid
   AND a.attnum = d.adnum
  WHERE n.nspname = 'public'
    AND c.relname = 'user_notification_preferences'
    AND a.attname = 'unsubscribe_token';

  IF email_default NOT ILIKE '%gen_random_bytes(32)%'
    OR preference_default NOT ILIKE '%gen_random_bytes(32)%'
  THEN
    RAISE EXCEPTION 'DB-106 requires 32-byte random unsubscribe-token defaults';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  EXECUTE 'SET LOCAL ROLE service_role';

  PERFORM public.subscribe_email_subscription(
    'db106@example.invalid',
    'landing_final_cta',
    '/',
    NULL,
    'db106-local-test',
    'DB-106 synthetic consent',
    'db106-test-v1'
  );

  SELECT unsubscribe_token
  INTO STRICT existing_token
  FROM public.email_subscription
  WHERE email_normalized = 'db106@example.invalid';

  IF pg_catalog.char_length(existing_token) <> 64
    OR existing_token !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'DB-106 generated an invalid unsubscribe token';
  END IF;

  -- Both missing and existing well-formed tokens return void. Callers cannot
  -- distinguish whether a subscription existed from the function result.
  PERFORM public.unsubscribe_email_subscription_by_token(missing_token);
  PERFORM public.unsubscribe_email_subscription_by_token(existing_token);

  IF NOT EXISTS (
    SELECT 1
    FROM public.email_subscription
    WHERE email_normalized = 'db106@example.invalid'
      AND status = 'unsubscribed'
      AND unsubscribed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'DB-106 valid token did not unsubscribe the synthetic row';
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM pg_catalog.set_config('request.jwt.claim.role', '', true);

  DELETE FROM public.email_subscription
  WHERE email_normalized = 'db106@example.invalid';
END;
$db106$;
