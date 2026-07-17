-- DB-101 transactional regression proof.
-- Run only against a local or explicitly disposable database. All fixtures
-- are removed before the statement completes, including Auth trigger effects.

DO $db101$
DECLARE
    v_user_id uuid := 'db101000-0000-4000-8000-000000000001';
    v_content_a uuid := 'db101000-0000-4000-8000-000000000002';
    v_content_b uuid := 'db101000-0000-4000-8000-000000000003';
    v_content_c uuid := 'db101000-0000-4000-8000-000000000004';
    v_segment_a uuid := 'db101000-0000-4000-8000-000000000005';
    v_segment_b uuid := 'db101000-0000-4000-8000-000000000006';
    v_segment_c uuid := 'db101000-0000-4000-8000-000000000007';
    v_query extensions.vector(768) := (
        ARRAY[1.0::real, 0.0::real]
        || pg_catalog.array_fill(0.0::real, ARRAY[766])
    )::extensions.vector;
    v_embedding_a extensions.vector(768) := (
        ARRAY[0.85::real, 0.52678269::real]
        || pg_catalog.array_fill(0.0::real, ARRAY[766])
    )::extensions.vector;
    v_embedding_b extensions.vector(768) := (
        ARRAY[0.8::real, 0.6::real]
        || pg_catalog.array_fill(0.0::real, ARRAY[766])
    )::extensions.vector;
    v_embedding_c extensions.vector(768) := (
        ARRAY[0.7::real, 0.71414284::real]
        || pg_catalog.array_fill(0.0::real, ARRAY[766])
    )::extensions.vector;
    v_index_opclass text;
    v_normal_order uuid[];
    v_boosted_order uuid[];
    v_boosted_similarity double precision;
    v_plan_line text;
    v_plan text := '';
    v_function_config text[];
BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

    SELECT opc.opcname
    INTO v_index_opclass
    FROM pg_catalog.pg_class idx
    INNER JOIN pg_catalog.pg_namespace ns
        ON ns.oid = idx.relnamespace
    INNER JOIN pg_catalog.pg_index pi
        ON pi.indexrelid = idx.oid
    INNER JOIN pg_catalog.pg_opclass opc
        ON opc.oid = pi.indclass[0]
    WHERE ns.nspname = 'public'
      AND idx.relname = 'segment_embedding_gemini_embedding_idx';

    IF v_index_opclass IS DISTINCT FROM 'vector_cosine_ops' THEN
        RAISE EXCEPTION 'DB-101 expected vector_cosine_ops, found %', v_index_opclass;
    END IF;

    SELECT p.proconfig
    INTO v_function_config
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace ns
        ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'private'
      AND p.proname = 'match_library_segments_gemini_internal'
      AND p.pronargs = 5;

    IF NOT ('hnsw.iterative_scan=strict_order' = ANY(v_function_config))
       OR NOT ('hnsw.ef_search=200' = ANY(v_function_config))
       OR NOT ('enable_seqscan=off' = ANY(v_function_config)) THEN
        RAISE EXCEPTION 'DB-101 expected strict iterative HNSW settings, found %', v_function_config;
    END IF;

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
        'db101-vector-check@example.invalid',
        '',
        pg_catalog.now(),
        '{}'::jsonb,
        '{}'::jsonb,
        pg_catalog.now(),
        pg_catalog.now()
    );

    INSERT INTO public.content_item (id, type, title, status)
    VALUES
        (v_content_a, 'article', 'DB-101 cosine rank A', 'verified'),
        (v_content_b, 'article', 'DB-101 cosine rank B', 'verified'),
        (v_content_c, 'article', 'DB-101 cosine rank C', 'verified');

    INSERT INTO public.segment (id, item_id, order_index, markdown_body)
    VALUES
        (v_segment_a, v_content_a, 0, 'DB-101 fixture A'),
        (v_segment_b, v_content_b, 0, 'DB-101 fixture B'),
        (v_segment_c, v_content_c, 0, 'DB-101 fixture C');

    INSERT INTO public.segment_embedding_gemini (
        segment_id,
        content_item_id,
        embedding
    )
    VALUES
        (v_segment_a, v_content_a, v_embedding_a),
        (v_segment_b, v_content_b, v_embedding_b),
        (v_segment_c, v_content_c, v_embedding_c);

    INSERT INTO public.user_library (user_id, content_id, progress)
    VALUES
        (v_user_id, v_content_a, '{"isCompleted":false}'::jsonb),
        (v_user_id, v_content_b, '{"isCompleted":true}'::jsonb),
        (v_user_id, v_content_c, '{"isCompleted":false}'::jsonb);

    SELECT pg_catalog.array_agg(matched.segment_id ORDER BY matched.ordinality)
    INTO v_normal_order
    FROM public.match_library_segments_gemini(
        v_query,
        0.5,
        3,
        v_user_id,
        false
    ) WITH ORDINALITY AS matched(segment_id, content_item_id, similarity, ordinality);

    IF v_normal_order IS DISTINCT FROM ARRAY[v_segment_a, v_segment_b, v_segment_c] THEN
        RAISE EXCEPTION 'DB-101 cosine ranking changed: %', v_normal_order;
    END IF;

    SELECT
        pg_catalog.array_agg(matched.segment_id ORDER BY matched.ordinality),
        max(matched.similarity) FILTER (WHERE matched.segment_id = v_segment_b)
    INTO v_boosted_order, v_boosted_similarity
    FROM public.match_library_segments_gemini(
        v_query,
        0.5,
        3,
        v_user_id,
        true
    ) WITH ORDINALITY AS matched(segment_id, content_item_id, similarity, ordinality);

    IF v_boosted_order IS DISTINCT FROM ARRAY[v_segment_b, v_segment_a, v_segment_c] THEN
        RAISE EXCEPTION 'DB-101 completion-boosted ranking changed: %', v_boosted_order;
    END IF;

    IF abs(v_boosted_similarity - 0.88) > 0.000001 THEN
        RAISE EXCEPTION 'DB-101 expected boosted similarity 0.88, found %', v_boosted_similarity;
    END IF;

    -- A tiny fixture is normally cheaper to scan sequentially. Disabling only
    -- sequential scans here proves that the cosine ORDER BY is index-eligible;
    -- representative planner selection is benchmarked separately at scale.
    PERFORM pg_catalog.set_config('enable_seqscan', 'off', true);
    FOR v_plan_line IN
        EXECUTE pg_catalog.format(
            'EXPLAIN (FORMAT TEXT) SELECT segment_id FROM public.segment_embedding_gemini ORDER BY embedding <=> %L::extensions.vector LIMIT 3',
            v_query::text
        )
    LOOP
        v_plan := v_plan || E'\n' || v_plan_line;
    END LOOP;

    IF v_plan NOT LIKE '%segment_embedding_gemini_embedding_idx%' THEN
        RAISE EXCEPTION 'DB-101 cosine index was not eligible for the intended plan: %', v_plan;
    END IF;

    DELETE FROM public.user_library WHERE user_id = v_user_id;
    DELETE FROM public.content_item WHERE id IN (v_content_a, v_content_b, v_content_c);
    DELETE FROM auth.users WHERE id = v_user_id;
END;
$db101$;
