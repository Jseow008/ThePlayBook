BEGIN;

SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION pg_temp.assert_count(
    p_query text,
    p_expected bigint,
    p_label text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    actual bigint;
BEGIN
    EXECUTE format('SELECT count(*) FROM (%s) AS checked_rows', p_query)
    INTO actual;

    IF actual IS DISTINCT FROM p_expected THEN
        RAISE EXCEPTION '%: expected %, got %', p_label, p_expected, actual;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_affected(
    p_statement text,
    p_expected bigint,
    p_label text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    actual bigint;
BEGIN
    EXECUTE p_statement;
    GET DIAGNOSTICS actual = ROW_COUNT;

    IF actual IS DISTINCT FROM p_expected THEN
        RAISE EXCEPTION '%: expected % affected rows, got %', p_label, p_expected, actual;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_insufficient_privilege(
    p_statement text,
    p_label text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    BEGIN
        EXECUTE p_statement;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RETURN;
    END;

    RAISE EXCEPTION '%: statement unexpectedly succeeded', p_label;
END;
$$;

DO $catalog_contract$
DECLARE
    failures text;
BEGIN
    WITH violations AS (
        SELECT format('public_table_without_rls: %I.%I', n.nspname, c.relname) AS failure
        FROM pg_class c
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND NOT c.relrowsecurity

        UNION ALL

        SELECT format('forbidden_policy_role: %I.%I policy %L', schemaname, tablename, policyname)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND ('public' = ANY (roles) OR 'service_role' = ANY (roles))

        UNION ALL

        SELECT format('deprecated_auth_role_policy: %I.%I policy %L', schemaname, tablename, policyname)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
              COALESCE(qual, '') LIKE '%auth.role()%'
              OR COALESCE(with_check, '') LIKE '%auth.role()%'
          )

        UNION ALL

        SELECT format('unoptimized_auth_uid_policy: %I.%I policy %L', schemaname, tablename, policyname)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
              COALESCE(qual, '') LIKE '%auth.uid()%'
              OR COALESCE(with_check, '') LIKE '%auth.uid()%'
          )
          AND NOT (
              COALESCE(qual, '') LIKE '%SELECT auth.uid()%'
              OR COALESCE(with_check, '') LIKE '%SELECT auth.uid()%'
          )

        UNION ALL

        SELECT format('incomplete_update_policy: %I.%I policy %L', schemaname, tablename, policyname)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND cmd = 'UPDATE'
          AND (qual IS NULL OR with_check IS NULL)

        UNION ALL

        SELECT 'unexpected_public_policy_count'
        WHERE (
            SELECT count(*)
            FROM pg_policies
            WHERE schemaname = 'public'
        ) <> 41

        UNION ALL

        SELECT 'admin_readiness_view_not_security_invoker'
        WHERE NOT EXISTS (
            SELECT 1
            FROM pg_class c
            INNER JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = 'admin_content_workbench_readiness'
              AND c.relkind = 'v'
              AND 'security_invoker=true' = ANY (COALESCE(c.reloptions, ARRAY[]::text[]))
              AND NOT has_table_privilege('anon', c.oid, 'SELECT')
              AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
              AND has_table_privilege('service_role', c.oid, 'SELECT')
        )
    )
    SELECT string_agg(failure, E'\n' ORDER BY failure)
    INTO failures
    FROM violations;

    IF failures IS NOT NULL THEN
        RAISE EXCEPTION 'DB-103 catalog contract failed:%', E'\n' || failures;
    END IF;
END;
$catalog_contract$;

-- Isolated fixtures; the surrounding transaction is always rolled back.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
VALUES
    ('00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'db103-owner@example.invalid', now(), now(), now()),
    ('00000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'db103-other@example.invalid', now(), now(), now()),
    ('00000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'db103-admin@example.invalid', now(), now(), now());

INSERT INTO public.profiles (id, email, role)
VALUES
    ('00000000-0000-4000-8000-000000000101', 'db103-owner@example.invalid', 'user'),
    ('00000000-0000-4000-8000-000000000102', 'db103-other@example.invalid', 'user'),
    ('00000000-0000-4000-8000-000000000103', 'db103-admin@example.invalid', 'admin')
ON CONFLICT (id) DO UPDATE
SET email = excluded.email,
    role = excluded.role;

INSERT INTO public.content_series (id, slug, title)
VALUES (
    '00000000-0000-4000-8000-000000000201',
    'db103-role-matrix-series',
    'DB-103 Role Matrix Series'
);

INSERT INTO public.content_item (id, type, title, status, series_id, series_order)
VALUES
    ('00000000-0000-4000-8000-000000000211', 'book', 'DB-103 Verified Fixture', 'verified', '00000000-0000-4000-8000-000000000201', 1),
    ('00000000-0000-4000-8000-000000000212', 'book', 'DB-103 Draft Fixture', 'draft', '00000000-0000-4000-8000-000000000201', 2);

INSERT INTO public.segment (id, item_id, order_index, title, markdown_body)
VALUES
    ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000211', 0, 'Verified segment', 'Verified body'),
    ('00000000-0000-4000-8000-000000000222', '00000000-0000-4000-8000-000000000212', 0, 'Draft segment', 'Draft body');

INSERT INTO public.artifact (id, item_id, type, payload_schema)
VALUES
    ('00000000-0000-4000-8000-000000000231', '00000000-0000-4000-8000-000000000211', 'checklist', '{}'::jsonb),
    ('00000000-0000-4000-8000-000000000232', '00000000-0000-4000-8000-000000000212', 'checklist', '{}'::jsonb);

INSERT INTO public.homepage_section (id, title, filter_type, filter_value, order_index)
VALUES (
    '00000000-0000-4000-8000-000000000241',
    'DB-103 Role Matrix Section',
    'featured',
    'true',
    999
);

INSERT INTO public.content_requests (
    id,
    title,
    normalized_title,
    content_type,
    status,
    submitted_by,
    hidden_at
)
VALUES
    ('00000000-0000-4000-8000-000000000251', 'DB-103 Visible Request', 'db-103 visible request', 'book', 'pending', '00000000-0000-4000-8000-000000000101', NULL),
    ('00000000-0000-4000-8000-000000000252', 'DB-103 Hidden Request', 'db-103 hidden request', 'book', 'pending', '00000000-0000-4000-8000-000000000102', now());

INSERT INTO public.user_library (user_id, content_id, is_bookmarked)
VALUES
    ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000211', true),
    ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000211', false);

INSERT INTO public.user_highlights (
    id,
    user_id,
    content_item_id,
    segment_id,
    highlighted_text
)
VALUES
    ('00000000-0000-4000-8000-000000000261', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000221', 'Owner highlight'),
    ('00000000-0000-4000-8000-000000000262', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000221', 'Other highlight');

INSERT INTO public.content_feedback (id, user_id, content_id, is_positive)
VALUES
    ('00000000-0000-4000-8000-000000000271', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000211', true),
    ('00000000-0000-4000-8000-000000000272', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000211', false);

INSERT INTO public.reading_activity (id, user_id, activity_date, duration_seconds)
VALUES
    ('00000000-0000-4000-8000-000000000281', '00000000-0000-4000-8000-000000000101', DATE '2099-01-01', 60),
    ('00000000-0000-4000-8000-000000000282', '00000000-0000-4000-8000-000000000102', DATE '2099-01-01', 90);

INSERT INTO public.ai_message_usage (id, user_id, feature)
VALUES
    ('00000000-0000-4000-8000-000000000291', '00000000-0000-4000-8000-000000000101', 'db103-role-matrix'),
    ('00000000-0000-4000-8000-000000000292', '00000000-0000-4000-8000-000000000102', 'db103-role-matrix');

INSERT INTO public.user_notification_preferences (user_id)
VALUES
    ('00000000-0000-4000-8000-000000000101'),
    ('00000000-0000-4000-8000-000000000102')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.content_request_votes (user_id, request_id)
VALUES ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000251');

INSERT INTO public.content_request_notifications (id, request_id, user_id)
VALUES (
    '00000000-0000-4000-8000-000000000299',
    '00000000-0000-4000-8000-000000000251',
    '00000000-0000-4000-8000-000000000102'
);

-- Anonymous: intended public reads work; private rows and admin view do not.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;

SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.content_item WHERE id = '00000000-0000-4000-8000-000000000211'$$,
    1,
    'anon sees verified content'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.content_item WHERE id = '00000000-0000-4000-8000-000000000212'$$,
    0,
    'anon cannot see draft content'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.segment WHERE item_id IN ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000212')$$,
    1,
    'anon sees segments only for verified content'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.artifact WHERE item_id IN ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000212')$$,
    1,
    'anon sees artifacts only for verified content'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.content_series WHERE id = '00000000-0000-4000-8000-000000000201'$$,
    1,
    'anon sees public content series'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.homepage_section WHERE id = '00000000-0000-4000-8000-000000000241'$$,
    1,
    'anon sees homepage sections'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.content_requests WHERE id IN ('00000000-0000-4000-8000-000000000251', '00000000-0000-4000-8000-000000000252')$$,
    1,
    'anon sees only visible requests'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.user_library WHERE user_id = '00000000-0000-4000-8000-000000000101'$$,
    0,
    'anon cannot see library rows'
);
SELECT pg_temp.expect_insufficient_privilege(
    $$SELECT * FROM public.admin_content_workbench_readiness LIMIT 1$$,
    'anon cannot read admin readiness view'
);
SELECT pg_temp.expect_insufficient_privilege(
    $$INSERT INTO public.user_library (user_id, content_id) VALUES ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000212')$$,
    'anon cannot insert library rows'
);

RESET ROLE;

-- Authenticated owner: public reads and own rows work; other users remain hidden.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.content_item WHERE id = '00000000-0000-4000-8000-000000000211'$$,
    1,
    'authenticated user retains public reads'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.profiles WHERE id = '00000000-0000-4000-8000-000000000101'$$,
    1,
    'owner sees own profile'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.profiles WHERE id = '00000000-0000-4000-8000-000000000102'$$,
    0,
    'owner cannot see another profile'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.user_library WHERE user_id = '00000000-0000-4000-8000-000000000101'$$,
    1,
    'owner sees own library row'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.user_library WHERE user_id = '00000000-0000-4000-8000-000000000102'$$,
    0,
    'owner cannot see another library row'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.user_highlights WHERE user_id = '00000000-0000-4000-8000-000000000101'$$,
    1,
    'owner sees own highlight'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.content_feedback WHERE user_id = '00000000-0000-4000-8000-000000000101'$$,
    1,
    'owner sees own feedback'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.reading_activity WHERE user_id = '00000000-0000-4000-8000-000000000101'$$,
    1,
    'owner sees own reading activity'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.ai_message_usage WHERE user_id = '00000000-0000-4000-8000-000000000101'$$,
    1,
    'owner sees own AI usage'
);
SELECT pg_temp.assert_affected(
    $$UPDATE public.user_library SET is_bookmarked = false WHERE user_id = '00000000-0000-4000-8000-000000000101' AND content_id = '00000000-0000-4000-8000-000000000211'$$,
    1,
    'owner updates own library row'
);
SELECT pg_temp.assert_affected(
    $$UPDATE public.user_library SET is_bookmarked = true WHERE user_id = '00000000-0000-4000-8000-000000000102' AND content_id = '00000000-0000-4000-8000-000000000211'$$,
    0,
    'owner cannot update another library row'
);
SELECT pg_temp.expect_insufficient_privilege(
    $$UPDATE public.user_highlights SET user_id = '00000000-0000-4000-8000-000000000102' WHERE id = '00000000-0000-4000-8000-000000000261'$$,
    'highlight ownership cannot be reassigned'
);
SELECT pg_temp.expect_insufficient_privilege(
    $$INSERT INTO public.content_request_votes (user_id, request_id) VALUES ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000252')$$,
    'owner cannot vote as another user or on a hidden request'
);
SELECT pg_temp.assert_affected(
    $$INSERT INTO public.content_request_votes (user_id, request_id) VALUES ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000251')$$,
    1,
    'owner can vote on a visible request'
);
SELECT pg_temp.expect_insufficient_privilege(
    $$INSERT INTO public.homepage_section (title, filter_type, filter_value, order_index) VALUES ('DB-103 Non-admin Insert', 'featured', 'true', 1000)$$,
    'non-admin cannot insert homepage sections'
);
SELECT pg_temp.assert_affected(
    $$UPDATE public.homepage_section SET title = 'DB-103 Non-admin Update' WHERE id = '00000000-0000-4000-8000-000000000241'$$,
    0,
    'non-admin cannot update homepage sections'
);
SELECT pg_temp.expect_insufficient_privilege(
    $$SELECT * FROM public.admin_content_workbench_readiness LIMIT 1$$,
    'authenticated user cannot read admin readiness view'
);

RESET ROLE;

-- Admin: homepage management remains available through the existing profile role.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000103', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_affected(
    $$INSERT INTO public.homepage_section (id, title, filter_type, filter_value, order_index) VALUES ('00000000-0000-4000-8000-000000000242', 'DB-103 Admin Section', 'featured', 'true', 1001)$$,
    1,
    'admin inserts homepage sections'
);
SELECT pg_temp.assert_affected(
    $$UPDATE public.homepage_section SET title = 'DB-103 Admin Updated' WHERE id = '00000000-0000-4000-8000-000000000242'$$,
    1,
    'admin updates homepage sections'
);
SELECT pg_temp.assert_affected(
    $$DELETE FROM public.homepage_section WHERE id = '00000000-0000-4000-8000-000000000242'$$,
    1,
    'admin deletes homepage sections'
);

RESET ROLE;

-- service_role: BYPASSRLS preserves operational access without allow-all policies.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;

SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.user_library WHERE user_id IN ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102')$$,
    2,
    'service role bypasses owner filters'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.content_request_notifications WHERE id = '00000000-0000-4000-8000-000000000299'$$,
    1,
    'service role reaches notification rows without a service policy'
);
SELECT pg_temp.assert_count(
    $$SELECT 1 FROM public.admin_content_workbench_readiness WHERE id IN ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000212')$$,
    2,
    'service role retains the security-invoker admin view'
);

RESET ROLE;

ROLLBACK;
