-- DB-002 transactional regression proof.
-- Run only against a local or explicitly disposable database. Every fixture
-- and mutation is removed before the statement completes, including auth
-- trigger side effects. A failed assertion rolls back the whole statement.

DO $db002$
DECLARE
    v_user_id uuid := 'db002000-0000-4000-8000-000000000001';
    v_content_id uuid := 'db002000-0000-4000-8000-000000000002';
    v_highlighted_segment_id uuid := 'db002000-0000-4000-8000-000000000003';
    v_unhighlighted_segment_id uuid := 'db002000-0000-4000-8000-000000000004';
    v_highlight_id uuid := 'db002000-0000-4000-8000-000000000005';
    v_highlighted_embedding_id uuid := 'db002000-0000-4000-8000-000000000006';
    v_unhighlighted_embedding_id uuid := 'db002000-0000-4000-8000-000000000007';
    v_artifact_id uuid := 'db002000-0000-4000-8000-000000000008';
    v_draft_embedding_id uuid := 'db002000-0000-4000-8000-000000000009';
    v_new_segment_id uuid;
    v_removal_blocked boolean := false;
BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        'db002-highlight-check@example.invalid',
        '',
        pg_catalog.now(),
        '{}'::jsonb,
        '{}'::jsonb,
        pg_catalog.now(),
        pg_catalog.now()
    );

    INSERT INTO public.content_item (id, type, title, status)
    VALUES (v_content_id, 'article', 'DB-002 original title', 'verified');

    INSERT INTO public.segment (id, item_id, order_index, title, markdown_body)
    VALUES
        (
            v_highlighted_segment_id,
            v_content_id,
            0,
            'Highlighted segment',
            'Original highlighted body'
        ),
        (
            v_unhighlighted_segment_id,
            v_content_id,
            1,
            'Unhighlighted segment',
            'Stable unhighlighted body'
        );

    INSERT INTO public.user_highlights (
        id,
        user_id,
        content_item_id,
        segment_id,
        highlighted_text
    )
    VALUES (
        v_highlight_id,
        v_user_id,
        v_content_id,
        v_highlighted_segment_id,
        'saved words'
    );

    INSERT INTO public.segment_embedding_gemini (
        id,
        segment_id,
        content_item_id,
        embedding
    )
    VALUES
        (
            v_highlighted_embedding_id,
            v_highlighted_segment_id,
            v_content_id,
            pg_catalog.array_fill(0.0::real, ARRAY[768])::extensions.vector
        ),
        (
            v_unhighlighted_embedding_id,
            v_unhighlighted_segment_id,
            v_content_id,
            pg_catalog.array_fill(0.0::real, ARRAY[768])::extensions.vector
        );

    INSERT INTO public.artifact (id, item_id, type, payload_schema, version)
    VALUES (
        v_artifact_id,
        v_content_id,
        'checklist',
        '{"title":"DB-002 retained artifact"}'::jsonb,
        '1.0.0'
    );

    -- Edit a highlighted body, reorder both existing segments, and add a new
    -- segment. Existing UUIDs and the attached highlight must survive.
    PERFORM public.admin_update_content_graph(
        v_content_id,
        '{}'::jsonb,
        pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
                'id', v_unhighlighted_segment_id,
                'order_index', 0,
                'title', 'Unhighlighted segment',
                'markdown_body', 'Stable unhighlighted body'
            ),
            pg_catalog.jsonb_build_object(
                'id', v_highlighted_segment_id,
                'order_index', 1,
                'title', 'Highlighted segment edited',
                'markdown_body', 'Edited highlighted body'
            ),
            pg_catalog.jsonb_build_object(
                'order_index', 2,
                'title', 'New segment',
                'markdown_body', 'New body'
            )
        ),
        NULL
    );

    SELECT id
    INTO STRICT v_new_segment_id
    FROM public.segment
    WHERE item_id = v_content_id
      AND markdown_body = 'New body';

    IF NOT EXISTS (
        SELECT 1
        FROM public.user_highlights
        WHERE id = v_highlight_id
          AND segment_id = v_highlighted_segment_id
          AND content_item_id = v_content_id
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: the saved highlight did not survive an in-place segment update';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.segment
        WHERE id = v_highlighted_segment_id
          AND item_id = v_content_id
          AND order_index = 1
          AND title = 'Highlighted segment edited'
          AND markdown_body = 'Edited highlighted body'
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: highlighted segment identity or edited values were not preserved';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.segment
        WHERE id = v_unhighlighted_segment_id
          AND item_id = v_content_id
          AND order_index = 0
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: existing segments could not be reordered safely';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.segment_embedding_gemini
        WHERE id = v_highlighted_embedding_id
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: a changed segment body retained a stale Gemini embedding';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.segment_embedding_gemini
        WHERE id = v_unhighlighted_embedding_id
          AND segment_id = v_unhighlighted_segment_id
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: an unchanged segment body lost its Gemini embedding';
    END IF;

    -- Omit the highlighted segment. The function must return its stable error
    -- code/message and leave every row unchanged.
    BEGIN
        PERFORM public.admin_update_content_graph(
            v_content_id,
            '{"title":"DB-002 title that must not persist"}'::jsonb,
            pg_catalog.jsonb_build_array(
                pg_catalog.jsonb_build_object(
                    'id', v_unhighlighted_segment_id,
                    'order_index', 0,
                    'title', 'Unhighlighted segment',
                    'markdown_body', 'Stable unhighlighted body'
                ),
                pg_catalog.jsonb_build_object(
                    'id', v_new_segment_id,
                    'order_index', 1,
                    'title', 'New segment',
                    'markdown_body', 'New body'
                )
            ),
            '[]'::jsonb
        );
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            IF SQLERRM = 'DB002_HIGHLIGHTED_SEGMENT_REMOVAL' THEN
                v_removal_blocked := true;
            ELSE
                RAISE;
            END IF;
    END;

    IF NOT v_removal_blocked THEN
        RAISE EXCEPTION 'DB-002 regression: removing a highlighted segment was not blocked';
    END IF;

    IF (SELECT title FROM public.content_item WHERE id = v_content_id) <> 'DB-002 original title' THEN
        RAISE EXCEPTION 'DB-002 regression: a rejected graph update partially changed the content item';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.user_highlights
        WHERE id = v_highlight_id
          AND segment_id = v_highlighted_segment_id
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: a rejected graph update removed its highlight';
    END IF;

    IF (SELECT pg_catalog.count(*) FROM public.segment WHERE item_id = v_content_id) <> 3 THEN
        RAISE EXCEPTION 'DB-002 regression: a rejected graph update partially changed the segment graph';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.artifact
        WHERE id = v_artifact_id
          AND item_id = v_content_id
          AND payload_schema = '{"title":"DB-002 retained artifact"}'::jsonb
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: a rejected graph update partially changed artifacts';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.segment_embedding_gemini
        WHERE id = v_unhighlighted_embedding_id
          AND segment_id = v_unhighlighted_segment_id
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: a rejected graph update partially changed embeddings';
    END IF;

    -- Omitting an unhighlighted segment remains supported.
    PERFORM public.admin_update_content_graph(
        v_content_id,
        '{}'::jsonb,
        pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
                'id', v_highlighted_segment_id,
                'order_index', 0,
                'title', 'Highlighted segment edited',
                'markdown_body', 'Edited highlighted body'
            ),
            pg_catalog.jsonb_build_object(
                'id', v_new_segment_id,
                'order_index', 1,
                'title', 'New segment',
                'markdown_body', 'New body'
            )
        ),
        NULL
    );

    IF EXISTS (
        SELECT 1
        FROM public.segment
        WHERE id = v_unhighlighted_segment_id
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: an unhighlighted omitted segment was not removed';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.user_highlights
        WHERE id = v_highlight_id
          AND segment_id = v_highlighted_segment_id
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: later unhighlighted cleanup removed the saved highlight';
    END IF;

    INSERT INTO public.segment_embedding_gemini (
        id,
        segment_id,
        content_item_id,
        embedding
    )
    VALUES (
        v_draft_embedding_id,
        v_highlighted_segment_id,
        v_content_id,
        pg_catalog.array_fill(0.0::real, ARRAY[768])::extensions.vector
    );

    -- Preserve the prior verified-only embedding lifecycle when an editor
    -- saves a complete segment graph while moving content back to draft.
    PERFORM public.admin_update_content_graph(
        v_content_id,
        '{"status":"draft"}'::jsonb,
        pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
                'id', v_highlighted_segment_id,
                'order_index', 0,
                'title', 'Highlighted segment edited',
                'markdown_body', 'Edited highlighted body'
            ),
            pg_catalog.jsonb_build_object(
                'id', v_new_segment_id,
                'order_index', 1,
                'title', 'New segment',
                'markdown_body', 'New body'
            )
        ),
        NULL
    );

    IF EXISTS (
        SELECT 1
        FROM public.segment_embedding_gemini
        WHERE id = v_draft_embedding_id
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: draft content retained a retrieval embedding';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.user_highlights
        WHERE id = v_highlight_id
          AND segment_id = v_highlighted_segment_id
    ) THEN
        RAISE EXCEPTION 'DB-002 regression: draft transition removed the saved highlight';
    END IF;

    DELETE FROM public.content_item WHERE id = v_content_id;
    DELETE FROM auth.users WHERE id = v_user_id;

    IF EXISTS (SELECT 1 FROM public.content_item WHERE id = v_content_id)
       OR EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
        RAISE EXCEPTION 'DB-002 regression: transactional fixtures were not cleaned up';
    END IF;

    RAISE NOTICE 'DB-002 highlight-preservation checks passed';
END;
$db002$;
