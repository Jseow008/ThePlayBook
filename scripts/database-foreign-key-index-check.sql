BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL enable_seqscan = off;
SET LOCAL enable_bitmapscan = off;

DO $catalog_contract$
DECLARE
    failures text;
BEGIN
    WITH expected_indexes(index_name, table_name, key_columns, include_columns) AS (
        VALUES
            ('idx_content_reader_daily_user_activity_date', 'content_reader_daily', ARRAY['user_id', 'activity_date'], ARRAY['content_id']),
            ('idx_content_request_notifications_user_id', 'content_request_notifications', ARRAY['user_id'], ARRAY[]::text[]),
            ('idx_content_requests_published_content_id', 'content_requests', ARRAY['published_content_id'], ARRAY[]::text[]),
            ('idx_content_requests_submitted_by', 'content_requests', ARRAY['submitted_by'], ARRAY['id']),
            ('idx_segment_embedding_gemini_content_item_id', 'segment_embedding_gemini', ARRAY['content_item_id'], ARRAY['segment_id']),
            ('idx_user_highlights_content_item_id', 'user_highlights', ARRAY['content_item_id'], ARRAY[]::text[]),
            ('idx_user_highlights_segment_id', 'user_highlights', ARRAY['segment_id'], ARRAY[]::text[])
    ),
    actual_indexes AS (
        SELECT
            index_record.relname AS index_name,
            table_record.relname AS table_name,
            index_metadata.indisvalid,
            index_metadata.indisready,
            index_metadata.indpred,
            array_agg(column_record.attname::text ORDER BY key_position.ordinality)
                FILTER (WHERE key_position.ordinality <= index_metadata.indnkeyatts) AS key_columns,
            COALESCE(
                array_agg(column_record.attname::text ORDER BY key_position.ordinality)
                    FILTER (WHERE key_position.ordinality > index_metadata.indnkeyatts),
                ARRAY[]::text[]
            ) AS include_columns
        FROM pg_class index_record
        INNER JOIN pg_namespace schema_record
            ON schema_record.oid = index_record.relnamespace
        INNER JOIN pg_index index_metadata
            ON index_metadata.indexrelid = index_record.oid
        INNER JOIN pg_class table_record
            ON table_record.oid = index_metadata.indrelid
        CROSS JOIN LATERAL unnest(index_metadata.indkey)
            WITH ORDINALITY AS key_position(attnum, ordinality)
        INNER JOIN pg_attribute column_record
            ON column_record.attrelid = table_record.oid
           AND column_record.attnum = key_position.attnum
        WHERE schema_record.nspname = 'public'
          AND index_record.relname IN (SELECT expected.index_name FROM expected_indexes expected)
        GROUP BY
            index_record.relname,
            table_record.relname,
            index_metadata.indisvalid,
            index_metadata.indisready,
            index_metadata.indpred,
            index_metadata.indnkeyatts
    ),
    violations AS (
        SELECT format('missing_or_changed_index: %s', expected.index_name) AS failure
        FROM expected_indexes expected
        LEFT JOIN actual_indexes actual
            ON actual.index_name = expected.index_name
        WHERE actual.index_name IS NULL
           OR actual.table_name <> expected.table_name
           OR actual.key_columns <> expected.key_columns
           OR actual.include_columns <> expected.include_columns
           OR NOT actual.indisvalid
           OR NOT actual.indisready
           OR actual.indpred IS NOT NULL

        UNION ALL

        SELECT format('uncovered_foreign_key: %s', constraint_record.conname)
        FROM pg_constraint constraint_record
        WHERE constraint_record.conname IN (
            'content_reader_daily_user_id_fkey',
            'content_request_notifications_user_id_fkey',
            'content_requests_published_content_id_fkey',
            'content_requests_submitted_by_fkey',
            'segment_embedding_gemini_content_item_id_fkey',
            'user_highlights_content_item_id_fkey',
            'user_highlights_segment_id_fkey'
        )
          AND NOT EXISTS (
              SELECT 1
              FROM pg_index index_metadata
              WHERE index_metadata.indrelid = constraint_record.conrelid
                AND index_metadata.indisvalid
                AND index_metadata.indisready
                AND index_metadata.indpred IS NULL
                AND index_metadata.indkey[0] = constraint_record.conkey[1]
          )
    )
    SELECT string_agg(failure, E'\n' ORDER BY failure)
    INTO failures
    FROM violations;

    IF failures IS NOT NULL THEN
        RAISE EXCEPTION 'DB-104 catalog contract failed:%', E'\n' || failures;
    END IF;
END;
$catalog_contract$;

CREATE OR REPLACE FUNCTION pg_temp.assert_plan_uses_index(
    p_query text,
    p_index_name text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    plan jsonb;
BEGIN
    EXECUTE 'EXPLAIN (FORMAT JSON) ' || p_query INTO plan;

    IF plan::text NOT LIKE ('%"Index Name": "' || p_index_name || '"%') THEN
        RAISE EXCEPTION 'DB-104 expected plan to use %, got %', p_index_name, plan;
    END IF;
END;
$$;

SELECT pg_temp.assert_plan_uses_index(
    $$SELECT id FROM public.content_reader_daily
      WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid$$,
    'idx_content_reader_daily_user_activity_date'
);

SELECT pg_temp.assert_plan_uses_index(
    $$SELECT id FROM public.content_request_notifications
      WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid$$,
    'idx_content_request_notifications_user_id'
);

SELECT pg_temp.assert_plan_uses_index(
    $$SELECT id FROM public.content_requests
      WHERE published_content_id = '00000000-0000-0000-0000-000000000000'::uuid$$,
    'idx_content_requests_published_content_id'
);

SELECT pg_temp.assert_plan_uses_index(
    $$SELECT id FROM public.content_requests
      WHERE submitted_by = '00000000-0000-0000-0000-000000000000'::uuid$$,
    'idx_content_requests_submitted_by'
);

SELECT pg_temp.assert_plan_uses_index(
    $$SELECT segment_id FROM public.segment_embedding_gemini
      WHERE content_item_id = '00000000-0000-0000-0000-000000000000'::uuid$$,
    'idx_segment_embedding_gemini_content_item_id'
);

SELECT pg_temp.assert_plan_uses_index(
    $$SELECT id FROM public.user_highlights
      WHERE content_item_id = '00000000-0000-0000-0000-000000000000'::uuid$$,
    'idx_user_highlights_content_item_id'
);

SELECT pg_temp.assert_plan_uses_index(
    $$SELECT id FROM public.user_highlights
      WHERE segment_id = '00000000-0000-0000-0000-000000000000'::uuid$$,
    'idx_user_highlights_segment_id'
);

ROLLBACK;
