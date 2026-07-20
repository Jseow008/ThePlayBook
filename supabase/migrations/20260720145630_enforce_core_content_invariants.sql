-- DB-105: enforce core content invariants that are already satisfied by the
-- production dataset and by every known repository write path.
--
-- Constraints are added NOT VALID first so the short catalog change does not
-- scan tables while holding its strongest lock. Each constraint is then
-- validated explicitly. New writes are checked as soon as ADD CONSTRAINT
-- succeeds, including while validation is running.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $preflight$
DECLARE
    existing_names text;
    violations text;
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
    )
    SELECT string_agg(format('%I.%I', expected.table_name, expected.constraint_name), ', ' ORDER BY expected.table_name, expected.constraint_name)
    INTO existing_names
    FROM expected
    INNER JOIN pg_catalog.pg_constraint constraint_record
        ON constraint_record.conname = expected.constraint_name
       AND constraint_record.conrelid = pg_catalog.to_regclass('public.' || expected.table_name);

    IF existing_names IS NOT NULL THEN
        RAISE EXCEPTION 'DB-105 preflight found existing constraint names: %', existing_names;
    END IF;

    WITH violation_counts(rule_name, violation_count) AS (
        SELECT
            'content_item_title_contract',
            count(*)
        FROM public.content_item
        WHERE char_length(pg_catalog.btrim(title)) NOT BETWEEN 1 AND 300

        UNION ALL

        SELECT
            'content_item_duration_positive',
            count(*)
        FROM public.content_item
        WHERE duration_seconds IS NOT NULL
          AND duration_seconds <= 0

        UNION ALL

        SELECT
            'content_item_category_shape',
            count(*)
        FROM public.content_item
        WHERE category IS NOT NULL
          AND (
              category IS DISTINCT FROM pg_catalog.btrim(category)
              OR char_length(category) NOT BETWEEN 1 AND 120
          )

        UNION ALL

        SELECT
            'content_item_quick_mode_shape',
            count(*)
        FROM public.content_item
        WHERE quick_mode_json IS NOT NULL
          AND quick_mode_json <> '{}'::jsonb
          AND (
              pg_catalog.jsonb_typeof(quick_mode_json) IS DISTINCT FROM 'object'
              OR pg_catalog.jsonb_typeof(quick_mode_json -> 'hook') IS DISTINCT FROM 'string'
              OR pg_catalog.jsonb_typeof(quick_mode_json -> 'big_idea') IS DISTINCT FROM 'string'
              OR pg_catalog.jsonb_typeof(quick_mode_json -> 'key_takeaways') IS DISTINCT FROM 'array'
              OR pg_catalog.jsonb_path_exists(
                  quick_mode_json,
                  '$.key_takeaways[*] ? (@.type() != "string")'
              )
          )

        UNION ALL

        SELECT
            'content_item_series_assignment',
            count(*)
        FROM public.content_item
        WHERE (series_id IS NULL) IS DISTINCT FROM (series_order IS NULL)
           OR (series_order IS NOT NULL AND series_order <= 0)

        UNION ALL

        SELECT
            'content_item_verified_published_at',
            count(*)
        FROM public.content_item
        WHERE status = 'verified'::public.content_status
          AND published_at IS NULL

        UNION ALL

        SELECT
            'segment_timing_pair',
            count(*)
        FROM public.segment
        WHERE NOT (
            (start_time_sec IS NULL AND end_time_sec IS NULL)
            OR (
                start_time_sec IS NOT NULL
                AND end_time_sec IS NOT NULL
                AND start_time_sec >= 0
                AND end_time_sec > start_time_sec
            )
        )

        UNION ALL

        SELECT
            'content_series_title_contract',
            count(*)
        FROM public.content_series
        WHERE title IS DISTINCT FROM pg_catalog.btrim(title)
           OR char_length(title) NOT BETWEEN 1 AND 120

        UNION ALL

        SELECT
            'content_series_slug_contract',
            count(*)
        FROM public.content_series
        WHERE slug IS DISTINCT FROM pg_catalog.btrim(slug)
           OR char_length(slug) NOT BETWEEN 1 AND 120
           OR slug !~ '^[a-z0-9-]+$'

        UNION ALL

        SELECT
            'content_series_description_length',
            count(*)
        FROM public.content_series
        WHERE description IS NOT NULL
          AND (
              description IS DISTINCT FROM pg_catalog.btrim(description)
              OR char_length(description) > 500
          )
    )
    SELECT string_agg(format('%s=%s', rule_name, violation_count), ', ' ORDER BY rule_name)
    INTO violations
    FROM violation_counts
    WHERE violation_count > 0;

    IF violations IS NOT NULL THEN
        RAISE EXCEPTION 'DB-105 production-data preflight failed: %', violations;
    END IF;
END;
$preflight$;

ALTER TABLE public.content_item
    ADD CONSTRAINT content_item_title_contract_check
    CHECK (char_length(pg_catalog.btrim(title)) BETWEEN 1 AND 300)
    NOT VALID;

ALTER TABLE public.content_item
    ADD CONSTRAINT content_item_duration_positive_check
    CHECK (duration_seconds IS NULL OR duration_seconds > 0)
    NOT VALID;

ALTER TABLE public.content_item
    ADD CONSTRAINT content_item_category_shape_check
    CHECK (
        category IS NULL
        OR (
            category = pg_catalog.btrim(category)
            AND char_length(category) BETWEEN 1 AND 120
        )
    )
    NOT VALID;

ALTER TABLE public.content_item
    ADD CONSTRAINT content_item_quick_mode_shape_check
    CHECK (
        quick_mode_json IS NULL
        OR quick_mode_json = '{}'::jsonb
        OR (
            pg_catalog.jsonb_typeof(quick_mode_json) = 'object'
            AND pg_catalog.jsonb_typeof(quick_mode_json -> 'hook') IS NOT DISTINCT FROM 'string'
            AND pg_catalog.jsonb_typeof(quick_mode_json -> 'big_idea') IS NOT DISTINCT FROM 'string'
            AND pg_catalog.jsonb_typeof(quick_mode_json -> 'key_takeaways') IS NOT DISTINCT FROM 'array'
            AND NOT pg_catalog.jsonb_path_exists(
                quick_mode_json,
                '$.key_takeaways[*] ? (@.type() != "string")'
            )
        )
    )
    NOT VALID;

ALTER TABLE public.content_item
    ADD CONSTRAINT content_item_series_assignment_check
    CHECK (
        (series_id IS NULL AND series_order IS NULL)
        OR (series_id IS NOT NULL AND series_order IS NOT NULL AND series_order > 0)
    )
    NOT VALID;

ALTER TABLE public.content_item
    ADD CONSTRAINT content_item_verified_published_at_check
    CHECK (status <> 'verified'::public.content_status OR published_at IS NOT NULL)
    NOT VALID;

ALTER TABLE public.segment
    ADD CONSTRAINT segment_timing_pair_check
    CHECK (
        (start_time_sec IS NULL AND end_time_sec IS NULL)
        OR (
            start_time_sec IS NOT NULL
            AND end_time_sec IS NOT NULL
            AND start_time_sec >= 0
            AND end_time_sec > start_time_sec
        )
    )
    NOT VALID;

ALTER TABLE public.content_series
    ADD CONSTRAINT content_series_title_contract_check
    CHECK (
        title = pg_catalog.btrim(title)
        AND char_length(title) BETWEEN 1 AND 120
    )
    NOT VALID;

ALTER TABLE public.content_series
    ADD CONSTRAINT content_series_slug_contract_check
    CHECK (
        slug = pg_catalog.btrim(slug)
        AND char_length(slug) BETWEEN 1 AND 120
        AND slug ~ '^[a-z0-9-]+$'
    )
    NOT VALID;

ALTER TABLE public.content_series
    ADD CONSTRAINT content_series_description_length_check
    CHECK (
        description IS NULL
        OR (
            description = pg_catalog.btrim(description)
            AND char_length(description) <= 500
        )
    )
    NOT VALID;

ALTER TABLE public.content_item VALIDATE CONSTRAINT content_item_title_contract_check;
ALTER TABLE public.content_item VALIDATE CONSTRAINT content_item_duration_positive_check;
ALTER TABLE public.content_item VALIDATE CONSTRAINT content_item_category_shape_check;
ALTER TABLE public.content_item VALIDATE CONSTRAINT content_item_quick_mode_shape_check;
ALTER TABLE public.content_item VALIDATE CONSTRAINT content_item_series_assignment_check;
ALTER TABLE public.content_item VALIDATE CONSTRAINT content_item_verified_published_at_check;
ALTER TABLE public.segment VALIDATE CONSTRAINT segment_timing_pair_check;
ALTER TABLE public.content_series VALIDATE CONSTRAINT content_series_title_contract_check;
ALTER TABLE public.content_series VALIDATE CONSTRAINT content_series_slug_contract_check;
ALTER TABLE public.content_series VALIDATE CONSTRAINT content_series_description_length_check;
