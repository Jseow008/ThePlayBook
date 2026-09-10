-- DB-107: disposable-database proof for the Phase 1 #7 snapshot worker.
-- This script is transactional and is safe only in the local CI Supabase DB.
BEGIN;

DO $fixture$
DECLARE
    account_a uuid := '10700000-0000-4000-8000-000000000001';
    account_b uuid := '10700000-0000-4000-8000-000000000002';
    content_id uuid := '10700000-0000-4000-8000-000000000003';
BEGIN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES
        ('00000000-0000-0000-0000-000000000000', account_a, 'authenticated', 'authenticated', 'db107-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        ('00000000-0000-0000-0000-000000000000', account_b, 'authenticated', 'authenticated', 'db107-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
    INSERT INTO public.content_item (id, type, title, status)
    VALUES (content_id, 'article', 'DB-107 fixture', 'verified');
    INSERT INTO public.user_library (user_id, content_id, is_bookmarked)
    VALUES (account_a, content_id, true), (account_b, content_id, false);
END;
$fixture$;

DO $catalog$
BEGIN
    IF has_schema_privilege('anon', 'snapshot_private', 'USAGE')
       OR has_schema_privilege('authenticated', 'snapshot_private', 'USAGE')
       OR has_table_privilege('authenticated', 'snapshot_private.account_data_snapshots', 'SELECT') THEN
        RAISE EXCEPTION 'DB-107 snapshot schema is exposed to an ordinary Data API role';
    END IF;
    IF NOT has_schema_privilege('netflux_snapshot_worker', 'snapshot_private', 'USAGE')
       OR NOT has_table_privilege('netflux_snapshot_worker', 'snapshot_private.account_data_snapshots', 'SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'DB-107 restricted snapshot worker lacks its minimum grant set';
    END IF;
END;
$catalog$;

-- This is an execution check, rather than a catalog-only assertion: an
-- ordinary authenticated Data API role cannot enumerate snapshot copies.
SET LOCAL ROLE authenticated;
DO $ordinary$
BEGIN
    PERFORM 1 FROM snapshot_private.account_data_snapshots;
    RAISE EXCEPTION 'DB-107 ordinary authenticated role read a snapshot table';
EXCEPTION
    WHEN insufficient_privilege THEN NULL;
END;
$ordinary$;
RESET ROLE;

SET LOCAL ROLE netflux_snapshot_worker;
SELECT set_config('app.snapshot_account_id', '10700000-0000-4000-8000-000000000001', true);

DO $worker$
DECLARE
    own_count integer;
    foreign_count integer;
BEGIN
    SELECT count(*) INTO own_count FROM public.user_library;
    IF own_count <> 1 THEN
        RAISE EXCEPTION 'DB-107 worker did not receive exactly the bound account library rows: %', own_count;
    END IF;
    SELECT count(*) INTO foreign_count
    FROM public.user_library
    WHERE user_id = '10700000-0000-4000-8000-000000000002';
    IF foreign_count <> 0 THEN
        RAISE EXCEPTION 'DB-107 worker read a foreign account row';
    END IF;
END;
$worker$;

RESET ROLE;
ROLLBACK;
