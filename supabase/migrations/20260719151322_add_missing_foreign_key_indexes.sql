-- DB-104: add the missing leading indexes on foreign-key columns.
--
-- Production audit on 2026-07-19 found seven advisor findings. The largest
-- affected relation, segment_embedding_gemini, had 4,088 rows and the
-- content_item_id lookup had 3,805 retained calls, so ordinary transactional
-- index creation is intentionally used with short lock and statement timeouts.
-- No table data is rewritten by this migration.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $preflight$
DECLARE
    failures text;
BEGIN
    WITH expected_foreign_keys(constraint_name, table_name, column_name) AS (
        VALUES
            ('content_reader_daily_user_id_fkey', 'content_reader_daily', 'user_id'),
            ('content_request_notifications_user_id_fkey', 'content_request_notifications', 'user_id'),
            ('content_requests_published_content_id_fkey', 'content_requests', 'published_content_id'),
            ('content_requests_submitted_by_fkey', 'content_requests', 'submitted_by'),
            ('segment_embedding_gemini_content_item_id_fkey', 'segment_embedding_gemini', 'content_item_id'),
            ('user_highlights_content_item_id_fkey', 'user_highlights', 'content_item_id'),
            ('user_highlights_segment_id_fkey', 'user_highlights', 'segment_id')
    ),
    missing AS (
        SELECT format('%I.%I (%I)', 'public', expected.table_name, expected.column_name) AS relationship
        FROM expected_foreign_keys expected
        WHERE NOT EXISTS (
            SELECT 1
            FROM pg_constraint constraint_record
            INNER JOIN pg_class table_record
                ON table_record.oid = constraint_record.conrelid
            INNER JOIN pg_namespace schema_record
                ON schema_record.oid = table_record.relnamespace
            INNER JOIN pg_attribute column_record
                ON column_record.attrelid = table_record.oid
               AND column_record.attnum = constraint_record.conkey[1]
            WHERE constraint_record.contype = 'f'
              AND constraint_record.conname = expected.constraint_name
              AND schema_record.nspname = 'public'
              AND table_record.relname = expected.table_name
              AND column_record.attname = expected.column_name
        )
    )
    SELECT string_agg(relationship, ', ' ORDER BY relationship)
    INTO failures
    FROM missing;

    IF failures IS NOT NULL THEN
        RAISE EXCEPTION 'DB-104 foreign-key preflight failed; missing or changed relationships: %', failures;
    END IF;
END;
$preflight$;

-- Supports user deletion cascades and the history-removal query that filters
-- by user and activity date while excluding one content item.
CREATE INDEX idx_content_reader_daily_user_activity_date
    ON public.content_reader_daily (user_id, activity_date)
    INCLUDE (content_id);

-- Supports profile deletion cascades. The existing unique index begins with
-- request_id and cannot efficiently service a user_id-only probe at scale.
CREATE INDEX idx_content_request_notifications_user_id
    ON public.content_request_notifications (user_id);

-- Supports the ON DELETE SET NULL probe from content_item and reverse lookups.
CREATE INDEX idx_content_requests_published_content_id
    ON public.content_requests (published_content_id);

-- Supports Auth user deletion and the application request-ownership lookup.
CREATE INDEX idx_content_requests_submitted_by
    ON public.content_requests (submitted_by)
    INCLUDE (id);

-- Supports content deletion cascades and the frequent embedding sync/read path
-- that filters by content_item_id and returns segment_id.
CREATE INDEX idx_segment_embedding_gemini_content_item_id
    ON public.segment_embedding_gemini (content_item_id)
    INCLUDE (segment_id);

-- The existing (user_id, content_item_id) index remains useful for owner reads;
-- this reverse index makes content deletion cascades scale predictably.
CREATE INDEX idx_user_highlights_content_item_id
    ON public.user_highlights (content_item_id);

-- Supports segment deletion cascades and highlight-preservation joins.
CREATE INDEX idx_user_highlights_segment_id
    ON public.user_highlights (segment_id);

DO $postflight$
DECLARE
    failures text;
BEGIN
    WITH expected_foreign_keys(constraint_name, index_name) AS (
        VALUES
            ('content_reader_daily_user_id_fkey', 'idx_content_reader_daily_user_activity_date'),
            ('content_request_notifications_user_id_fkey', 'idx_content_request_notifications_user_id'),
            ('content_requests_published_content_id_fkey', 'idx_content_requests_published_content_id'),
            ('content_requests_submitted_by_fkey', 'idx_content_requests_submitted_by'),
            ('segment_embedding_gemini_content_item_id_fkey', 'idx_segment_embedding_gemini_content_item_id'),
            ('user_highlights_content_item_id_fkey', 'idx_user_highlights_content_item_id'),
            ('user_highlights_segment_id_fkey', 'idx_user_highlights_segment_id')
    ),
    invalid AS (
        SELECT expected.constraint_name
        FROM expected_foreign_keys expected
        INNER JOIN pg_constraint constraint_record
            ON constraint_record.conname = expected.constraint_name
           AND constraint_record.contype = 'f'
        WHERE NOT EXISTS (
            SELECT 1
            FROM pg_class index_record
            INNER JOIN pg_namespace schema_record
                ON schema_record.oid = index_record.relnamespace
            INNER JOIN pg_index index_metadata
                ON index_metadata.indexrelid = index_record.oid
            WHERE schema_record.nspname = 'public'
              AND index_record.relname = expected.index_name
              AND index_metadata.indrelid = constraint_record.conrelid
              AND index_metadata.indisvalid
              AND index_metadata.indisready
              AND index_metadata.indpred IS NULL
              AND index_metadata.indkey[0] = constraint_record.conkey[1]
        )
    )
    SELECT string_agg(constraint_name, ', ' ORDER BY constraint_name)
    INTO failures
    FROM invalid;

    IF failures IS NOT NULL THEN
        RAISE EXCEPTION 'DB-104 index postflight failed: %', failures;
    END IF;
END;
$postflight$;
