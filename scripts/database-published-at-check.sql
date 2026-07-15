-- Transactional regression proof for first-publication timestamps.
-- Run only against a local or explicitly disposable database. Every fixture
-- is removed before the statement completes; a failed assertion rolls back
-- the entire statement.

DO $published_at$
DECLARE
    v_draft_id uuid := '70000000-0000-4000-8000-000000000001';
    v_import_id uuid := '70000000-0000-4000-8000-000000000002';
    v_first_published_at timestamptz;
    v_match_id uuid;
    v_match_published_at timestamptz;
BEGIN
    IF pg_catalog.to_regprocedure('public.set_content_item_published_at()') IS NULL THEN
        RAISE EXCEPTION 'Published-at regression: trigger function is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger trigger_row
        INNER JOIN pg_catalog.pg_class relation
            ON relation.oid = trigger_row.tgrelid
        INNER JOIN pg_catalog.pg_namespace namespace
            ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'content_item'
          AND trigger_row.tgname = 'set_content_item_published_at'
          AND NOT trigger_row.tgisinternal
    ) THEN
        RAISE EXCEPTION 'Published-at regression: content publication trigger is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'content_item'
          AND indexname = 'idx_content_item_verified_published_at'
          AND indexdef ILIKE '%published_at DESC%'
          AND indexdef ILIKE '%status = ''verified''%'
          AND indexdef ILIKE '%deleted_at IS NULL%'
    ) THEN
        RAISE EXCEPTION 'Published-at regression: verified-content partial index is missing or malformed';
    END IF;

    IF pg_catalog.has_function_privilege(
        'anon',
        'public.set_content_item_published_at()',
        'EXECUTE'
    ) OR pg_catalog.has_function_privilege(
        'authenticated',
        'public.set_content_item_published_at()',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Published-at regression: trigger function is directly executable by API roles';
    END IF;

    IF NOT pg_catalog.has_function_privilege(
        'anon',
        'public.match_recommendations(uuid[],uuid[],integer)',
        'EXECUTE'
    ) OR NOT pg_catalog.has_function_privilege(
        'authenticated',
        'public.get_homepage_sections_with_items(integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Published-at regression: an existing public read RPC grant was lost';
    END IF;

    INSERT INTO public.content_item (
        id,
        type,
        title,
        status,
        category,
        created_at
    )
    VALUES (
        v_draft_id,
        'article',
        'Published-at long-lived draft',
        'draft',
        'Published-at regression',
        '2025-01-01T00:00:00Z'::timestamptz
    );

    IF (SELECT published_at FROM public.content_item WHERE id = v_draft_id) IS NOT NULL THEN
        RAISE EXCEPTION 'Published-at regression: a draft received a publication timestamp';
    END IF;

    UPDATE public.content_item
    SET title = 'Published-at edited draft'
    WHERE id = v_draft_id;

    IF (SELECT published_at FROM public.content_item WHERE id = v_draft_id) IS NOT NULL THEN
        RAISE EXCEPTION 'Published-at regression: a draft edit assigned a publication timestamp';
    END IF;

    UPDATE public.content_item
    SET status = 'verified'
    WHERE id = v_draft_id
    RETURNING published_at INTO STRICT v_first_published_at;

    IF v_first_published_at IS NULL
       OR v_first_published_at < pg_catalog.now() - interval '10 seconds'
       OR v_first_published_at > pg_catalog.now() + interval '1 second' THEN
        RAISE EXCEPTION 'Published-at regression: first verification did not record the release time';
    END IF;

    UPDATE public.content_item
    SET published_at = '2000-01-01T00:00:00Z'::timestamptz
    WHERE id = v_draft_id;

    IF (SELECT published_at FROM public.content_item WHERE id = v_draft_id)
       IS DISTINCT FROM v_first_published_at THEN
        RAISE EXCEPTION 'Published-at regression: publication timestamp was mutable';
    END IF;

    UPDATE public.content_item SET status = 'draft' WHERE id = v_draft_id;
    UPDATE public.content_item SET status = 'verified' WHERE id = v_draft_id;

    IF (SELECT published_at FROM public.content_item WHERE id = v_draft_id)
       IS DISTINCT FROM v_first_published_at THEN
        RAISE EXCEPTION 'Published-at regression: re-verification changed the first release time';
    END IF;

    INSERT INTO public.content_item (
        id,
        type,
        title,
        status,
        category,
        created_at,
        published_at
    )
    VALUES (
        v_import_id,
        'article',
        'Published-at imported release',
        'verified',
        'Published-at regression',
        '2026-01-01T00:00:00Z'::timestamptz,
        '2025-06-01T00:00:00Z'::timestamptz
    );

    IF (SELECT published_at FROM public.content_item WHERE id = v_import_id)
       IS DISTINCT FROM '2025-06-01T00:00:00Z'::timestamptz THEN
        RAISE EXCEPTION 'Published-at regression: an explicit import timestamp was overwritten';
    END IF;

    SELECT recommendation.id, recommendation.published_at
    INTO STRICT v_match_id, v_match_published_at
    FROM public.match_recommendations(
        ARRAY[v_draft_id],
        ARRAY[]::uuid[],
        2
    ) AS recommendation
    LIMIT 1;

    IF v_match_id IS DISTINCT FROM v_draft_id
       OR v_match_published_at IS DISTINCT FROM v_first_published_at THEN
        RAISE EXCEPTION 'Published-at regression: recommendation fallback did not rank by release time';
    END IF;

    DELETE FROM public.content_item WHERE id IN (v_draft_id, v_import_id);

    IF EXISTS (
        SELECT 1
        FROM public.content_item
        WHERE id IN (v_draft_id, v_import_id)
    ) THEN
        RAISE EXCEPTION 'Published-at regression: synthetic fixtures were not removed';
    END IF;
END;
$published_at$;
