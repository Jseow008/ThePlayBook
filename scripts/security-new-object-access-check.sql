DO $db107$
DECLARE
    failures text;
    -- Tables are inventoried at the browser-role boundary. Exact row and
    -- operation behavior remains covered by database:rls-policies.
    catalog_query constant text := $catalog_query$
    WITH expected_table_roles(table_name, role_name) AS (
        VALUES
            ('ai_message_usage', 'anon'),
            ('ai_message_usage', 'authenticated'),
            ('artifact', 'anon'),
            ('artifact', 'authenticated'),
            ('content_feedback', 'anon'),
            ('content_feedback', 'authenticated'),
            ('content_item', 'anon'),
            ('content_item', 'authenticated'),
            ('content_request_notifications', 'anon'),
            ('content_request_notifications', 'authenticated'),
            ('content_request_votes', 'anon'),
            ('content_request_votes', 'authenticated'),
            ('content_requests', 'anon'),
            ('content_requests', 'authenticated'),
            ('content_series', 'anon'),
            ('content_series', 'authenticated'),
            ('homepage_section', 'anon'),
            ('homepage_section', 'authenticated'),
            ('profiles', 'anon'),
            ('profiles', 'authenticated'),
            ('reading_activity', 'anon'),
            ('reading_activity', 'authenticated'),
            ('segment', 'anon'),
            ('segment', 'authenticated'),
            ('user_highlights', 'anon'),
            ('user_highlights', 'authenticated'),
            ('user_library', 'anon'),
            ('user_library', 'authenticated'),
            ('user_topic_preferences', 'authenticated'),
            ('user_notification_preferences', 'authenticated')
    ),
    expected_function_roles(function_name, arguments, role_name) AS (
        VALUES
            ('get_category_stats', '', 'anon'),
            ('get_category_stats', '', 'authenticated'),
            ('get_homepage_sections_with_items', 'p_limit integer', 'anon'),
            ('get_homepage_sections_with_items', 'p_limit integer', 'authenticated'),
            ('get_random_verified_content', '', 'anon'),
            ('get_random_verified_content', '', 'authenticated'),
            ('get_trending_content', 'p_limit integer, p_type content_type, p_categories text[]', 'anon'),
            ('get_trending_content', 'p_limit integer, p_type content_type, p_categories text[]', 'authenticated'),
            ('is_admin', '', 'authenticated'),
            ('match_library_segments_gemini', 'query_embedding vector, match_threshold double precision, match_count integer, p_user_id uuid, p_boost_completed boolean', 'authenticated'),
            ('match_recommendations', 'seed_ids uuid[], exclude_ids uuid[], match_count integer', 'anon'),
            ('match_recommendations', 'seed_ids uuid[], exclude_ids uuid[], match_count integer', 'authenticated'),
            ('set_onboarding_state', 'p_tour text, p_version text, p_status text', 'authenticated')
    ),
    -- These two legacy read-only RPCs still have redundant PUBLIC grants in
    -- addition to explicit anon/authenticated grants. No new PUBLIC grant is
    -- accepted without changing this reviewed list.
    allowed_public_function_grants(function_name, arguments) AS (
        VALUES
            ('get_category_stats', ''),
            ('get_random_verified_content', '')
    ),
    public_tables AS (
        SELECT c.oid, c.relname, c.relrowsecurity
        FROM pg_catalog.pg_class c
        INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
    ),
    actual_table_roles AS (
        SELECT table_row.relname AS table_name, browser_role.role_name
        FROM public_tables table_row
        CROSS JOIN (VALUES ('anon'), ('authenticated')) AS browser_role(role_name)
        WHERE pg_catalog.has_table_privilege(
            browser_role.role_name,
            table_row.oid,
            'SELECT, INSERT, UPDATE, DELETE'
        )
    ),
    public_functions AS (
        SELECT
            p.oid,
            p.proacl,
            p.proowner,
            p.proname AS function_name,
            pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments
        FROM pg_catalog.pg_proc p
        INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
    ),
    actual_function_roles AS (
        SELECT
            function_row.function_name,
            function_row.arguments,
            browser_role.role_name
        FROM public_functions function_row
        CROSS JOIN (VALUES ('anon'), ('authenticated')) AS browser_role(role_name)
        WHERE pg_catalog.has_function_privilege(
            browser_role.role_name,
            function_row.oid,
            'EXECUTE'
        )
    ),
    actual_public_function_grants AS (
        SELECT function_row.function_name, function_row.arguments
        FROM public_functions function_row
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(
                function_row.proacl,
                pg_catalog.acldefault('f', function_row.proowner)
            )
        ) AS function_acl
        WHERE function_acl.grantee = 0
          AND function_acl.privilege_type = 'EXECUTE'
    )
    SELECT pg_catalog.format(
        'public_table_without_rls: public.%I',
        table_row.relname
    ) AS failure
    FROM public_tables table_row
    WHERE NOT table_row.relrowsecurity

    UNION ALL

    SELECT pg_catalog.format(
        'public_table_without_policy: public.%I',
        table_row.relname
    )
    FROM public_tables table_row
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policy policy
        WHERE policy.polrelid = table_row.oid
    )

    UNION ALL

    SELECT pg_catalog.format(
        'unexpected_browser_table_access: %s on public.%I',
        actual.role_name,
        actual.table_name
    )
    FROM actual_table_roles actual
    LEFT JOIN expected_table_roles expected
      ON expected.table_name = actual.table_name
     AND expected.role_name = actual.role_name
    WHERE expected.table_name IS NULL

    UNION ALL

    SELECT pg_catalog.format(
        'missing_reviewed_browser_table_access: %s on public.%I',
        expected.role_name,
        expected.table_name
    )
    FROM expected_table_roles expected
    LEFT JOIN actual_table_roles actual
      ON actual.table_name = expected.table_name
     AND actual.role_name = expected.role_name
    WHERE actual.table_name IS NULL

    UNION ALL

    SELECT pg_catalog.format(
        'public_view_not_security_invoker: public.%I',
        c.relname
    )
    FROM pg_catalog.pg_class c
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND NOT ('security_invoker=true' = ANY (COALESCE(c.reloptions, ARRAY[]::text[])))

    UNION ALL

    SELECT pg_catalog.format(
        'public_materialized_view_requires_review: public.%I',
        c.relname
    )
    FROM pg_catalog.pg_class c
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'm'

    UNION ALL

    SELECT pg_catalog.format(
        'browser_sequence_access_requires_review: %s on public.%I',
        browser_role.role_name,
        c.relname
    )
    FROM pg_catalog.pg_class c
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS browser_role(role_name)
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND pg_catalog.has_sequence_privilege(
          browser_role.role_name,
          c.oid,
          'USAGE, SELECT, UPDATE'
      )

    UNION ALL

    SELECT pg_catalog.format(
        'unexpected_browser_function_access: %s on public.%I(%s)',
        actual.role_name,
        actual.function_name,
        actual.arguments
    )
    FROM actual_function_roles actual
    LEFT JOIN expected_function_roles expected
      ON expected.function_name = actual.function_name
     AND expected.arguments = actual.arguments
     AND expected.role_name = actual.role_name
    WHERE expected.function_name IS NULL

    UNION ALL

    SELECT pg_catalog.format(
        'missing_reviewed_browser_function_access: %s on public.%I(%s)',
        expected.role_name,
        expected.function_name,
        expected.arguments
    )
    FROM expected_function_roles expected
    LEFT JOIN actual_function_roles actual
      ON actual.function_name = expected.function_name
     AND actual.arguments = expected.arguments
     AND actual.role_name = expected.role_name
    WHERE actual.function_name IS NULL

    UNION ALL

    SELECT pg_catalog.format(
        'unexpected_public_function_execute: public.%I(%s)',
        actual.function_name,
        actual.arguments
    )
    FROM actual_public_function_grants actual
    LEFT JOIN allowed_public_function_grants allowed
      ON allowed.function_name = actual.function_name
     AND allowed.arguments = actual.arguments
    WHERE allowed.function_name IS NULL
$catalog_query$;
BEGIN
    PERFORM pg_catalog.set_config('statement_timeout', '30s', true);

    EXECUTE pg_catalog.format(
        'SELECT string_agg(failure, %L ORDER BY failure) FROM (%s) violations',
        E'\n',
        catalog_query
    )
    INTO failures;

    IF failures IS NOT NULL THEN
        RAISE EXCEPTION 'DB-107 new-object access contract failed:%', E'\n' || failures;
    END IF;

    -- Prove that the catalog check fails closed. The fixtures are removed
    -- before this single statement commits.
    EXECUTE 'CREATE TABLE public.db107_unguarded_fixture (id bigint)';
    EXECUTE 'GRANT SELECT ON TABLE public.db107_unguarded_fixture TO anon';
    EXECUTE 'CREATE FUNCTION public.db107_unreviewed_rpc_fixture() RETURNS integer LANGUAGE sql AS ''SELECT 1''';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.db107_unreviewed_rpc_fixture() TO anon';
    EXECUTE 'CREATE VIEW public.db107_unsafe_view_fixture AS SELECT 1 AS id';
    EXECUTE 'GRANT SELECT ON TABLE public.db107_unsafe_view_fixture TO anon';

    EXECUTE pg_catalog.format(
        'SELECT string_agg(failure, %L ORDER BY failure) FROM (%s) violations',
        E'\n',
        catalog_query
    )
    INTO failures;

    IF failures NOT LIKE '%public_table_without_rls: public.db107_unguarded_fixture%'
       OR failures NOT LIKE '%public_table_without_policy: public.db107_unguarded_fixture%'
       OR failures NOT LIKE '%unexpected_browser_table_access: anon on public.db107_unguarded_fixture%'
       OR failures NOT LIKE '%unexpected_browser_function_access: anon on public.db107_unreviewed_rpc_fixture()%'
       OR failures NOT LIKE '%public_view_not_security_invoker: public.db107_unsafe_view_fixture%' THEN
        RAISE EXCEPTION 'DB-107 negative proof did not detect every unsafe fixture:%', E'\n' || COALESCE(failures, '<none>');
    END IF;

    EXECUTE 'DROP VIEW public.db107_unsafe_view_fixture';
    EXECUTE 'DROP FUNCTION public.db107_unreviewed_rpc_fixture()';
    EXECUTE 'DROP TABLE public.db107_unguarded_fixture';
END;
$db107$;
