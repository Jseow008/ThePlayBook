BEGIN;

SET LOCAL statement_timeout = '30s';

DO $catalog_contract$
DECLARE
    failures text;
BEGIN
    WITH expected(table_name, constraint_name) AS (
        VALUES
            ('content_item', 'content_item_title_contract_check'),
            ('content_item', 'content_item_duration_positive_check'),
            ('content_item', 'content_item_category_shape_check'),
            ('content_item', 'content_item_quick_mode_shape_check'),
            ('content_item', 'content_item_series_assignment_check'),
            ('content_item', 'content_item_verified_published_at_check'),
            ('segment', 'segment_timing_pair_check'),
            ('content_series', 'content_series_title_contract_check'),
            ('content_series', 'content_series_slug_contract_check'),
            ('content_series', 'content_series_description_length_check')
    ),
    missing_or_unvalidated AS (
        SELECT format('%I.%I', expected.table_name, expected.constraint_name) AS failure
        FROM expected
        LEFT JOIN pg_catalog.pg_constraint constraint_record
            ON constraint_record.conname = expected.constraint_name
           AND constraint_record.conrelid = pg_catalog.to_regclass('public.' || expected.table_name)
           AND constraint_record.contype = 'c'
           AND constraint_record.convalidated
        WHERE constraint_record.oid IS NULL
    )
    SELECT string_agg(failure, ', ' ORDER BY failure)
    INTO failures
    FROM missing_or_unvalidated;

    IF failures IS NOT NULL THEN
        RAISE EXCEPTION 'DB-105 catalog contract failed: %', failures;
    END IF;
END;
$catalog_contract$;

CREATE OR REPLACE FUNCTION pg_temp.assert_check_violation(
    p_label text,
    p_statement text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    BEGIN
        EXECUTE p_statement;
    EXCEPTION
        WHEN check_violation THEN
            RETURN;
    END;

    RAISE EXCEPTION 'DB-105 expected check violation: %', p_label;
END;
$$;

INSERT INTO public.content_series (id, slug, title, description)
VALUES (
    '10500000-0000-0000-0000-000000000001'::uuid,
    'db-105-valid-series',
    'DB-105 Valid Series',
    'Transactional constraint fixture'
);

INSERT INTO public.content_item (
    id,
    type,
    title,
    category,
    status,
    duration_seconds,
    quick_mode_json,
    series_id,
    series_order
)
VALUES (
    '10500000-0000-0000-0000-000000000002'::uuid,
    'article'::public.content_type,
    'DB-105 valid content',
    'Business',
    'draft'::public.content_status,
    120,
    '{"hook":"Hook","big_idea":"Idea","key_takeaways":["One"],"source_title":"Allowed extension"}'::jsonb,
    '10500000-0000-0000-0000-000000000001'::uuid,
    1
);

-- The service-only generated-content RPC currently uses an empty object as
-- its default draft payload, so that compatibility shape remains supported.
INSERT INTO public.content_item (id, type, title, status, quick_mode_json)
VALUES (
    '10500000-0000-0000-0000-000000000003'::uuid,
    'article'::public.content_type,
    'DB-105 empty quick-mode draft',
    'draft'::public.content_status,
    '{}'::jsonb
);

INSERT INTO public.segment (
    id,
    item_id,
    order_index,
    markdown_body,
    start_time_sec,
    end_time_sec
)
VALUES
    (
        '10500000-0000-0000-0000-000000000004'::uuid,
        '10500000-0000-0000-0000-000000000002'::uuid,
        0,
        'Zero-based ordering remains compatible.',
        NULL,
        NULL
    ),
    (
        '10500000-0000-0000-0000-000000000005'::uuid,
        '10500000-0000-0000-0000-000000000002'::uuid,
        1,
        'Complete timing pairs remain valid.',
        0,
        30
    );

SELECT pg_temp.assert_check_violation(
    'blank content title',
    $$INSERT INTO public.content_item (type, title) VALUES ('article', '   ')$$
);

SELECT pg_temp.assert_check_violation(
    'content title over 300 characters',
    $$INSERT INTO public.content_item (type, title) VALUES ('article', repeat('x', 301))$$
);

SELECT pg_temp.assert_check_violation(
    'nonpositive duration',
    $$UPDATE public.content_item SET duration_seconds = 0 WHERE id = '10500000-0000-0000-0000-000000000002'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'blank category',
    $$UPDATE public.content_item SET category = '  ' WHERE id = '10500000-0000-0000-0000-000000000002'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'untrimmed category',
    $$UPDATE public.content_item SET category = ' Business ' WHERE id = '10500000-0000-0000-0000-000000000002'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'invalid quick-mode key type',
    $$UPDATE public.content_item SET quick_mode_json = '{"hook":1,"big_idea":"Idea","key_takeaways":[]}'::jsonb WHERE id = '10500000-0000-0000-0000-000000000002'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'missing quick-mode core key',
    $$UPDATE public.content_item SET quick_mode_json = '{"hook":"Hook","key_takeaways":[]}'::jsonb WHERE id = '10500000-0000-0000-0000-000000000002'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'invalid quick-mode takeaway element',
    $$UPDATE public.content_item SET quick_mode_json = '{"hook":"Hook","big_idea":"Idea","key_takeaways":[1]}'::jsonb WHERE id = '10500000-0000-0000-0000-000000000002'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'series id without order',
    $$UPDATE public.content_item SET series_order = NULL WHERE id = '10500000-0000-0000-0000-000000000002'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'series order without id',
    $$UPDATE public.content_item SET series_id = NULL WHERE id = '10500000-0000-0000-0000-000000000002'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'nonpositive series order',
    $$UPDATE public.content_item SET series_order = 0 WHERE id = '10500000-0000-0000-0000-000000000002'::uuid$$
);

-- Bypass the publication trigger for one statement so the check constraint is
-- exercised independently. The invalid row is rejected and the transaction
-- returns to normal trigger behavior immediately afterward.
SET LOCAL session_replication_role = replica;

SELECT pg_temp.assert_check_violation(
    'verified content without published_at',
    $$INSERT INTO public.content_item (type, title, status, published_at) VALUES ('article', 'Unpublished verified fixture', 'verified', NULL)$$
);

SET LOCAL session_replication_role = origin;

SELECT pg_temp.assert_check_violation(
    'partial segment timing pair',
    $$UPDATE public.segment SET start_time_sec = 5, end_time_sec = NULL WHERE id = '10500000-0000-0000-0000-000000000004'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'negative segment timing',
    $$UPDATE public.segment SET start_time_sec = -1, end_time_sec = 5 WHERE id = '10500000-0000-0000-0000-000000000004'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'reversed segment timing',
    $$UPDATE public.segment SET start_time_sec = 10, end_time_sec = 10 WHERE id = '10500000-0000-0000-0000-000000000004'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'blank series title',
    $$UPDATE public.content_series SET title = '  ' WHERE id = '10500000-0000-0000-0000-000000000001'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'invalid series slug',
    $$UPDATE public.content_series SET slug = 'Invalid Slug' WHERE id = '10500000-0000-0000-0000-000000000001'::uuid$$
);

SELECT pg_temp.assert_check_violation(
    'series description over 500 characters',
    $$UPDATE public.content_series SET description = repeat('x', 501) WHERE id = '10500000-0000-0000-0000-000000000001'::uuid$$
);

-- CHECK constraints must remain effective for privileged application writes;
-- service_role bypasses RLS but does not bypass table constraints.
SET LOCAL ROLE service_role;

SELECT pg_temp.assert_check_violation(
    'service-role nonpositive duration',
    $$UPDATE public.content_item SET duration_seconds = -1 WHERE id = '10500000-0000-0000-0000-000000000002'::uuid$$
);

RESET ROLE;

ROLLBACK;

SELECT 'DB-105 content invariant checks passed' AS result;
