-- Apply only after the compatible server caller is live.
-- Preserve the existing fixed projection, ranking and eligibility rules.

CREATE OR REPLACE FUNCTION public.search_catalog(
    p_query text,
    p_categories text[],
    p_type public.content_type,
    p_after_rank numeric,
    p_after_content_id uuid,
    p_before_rank numeric,
    p_before_content_id uuid,
    p_limit integer
)
RETURNS TABLE (
    query_state text,
    content_id uuid,
    content_type public.content_type,
    title text,
    author text,
    category text,
    cover_image_url text,
    duration_seconds integer,
    audio_url text,
    created_at timestamptz,
    quick_mode_json jsonb,
    result_rank real,
    cursor_rank text,
    snippet_source text,
    snippet_headline text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_query text;
    v_terms tsquery;
    v_limit integer;
BEGIN
    -- Called only by the fixed server-side public catalog adapter.
    IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    v_query := nullif(regexp_replace(trim(coalesce(p_query, '')), '\\s+', ' ', 'g'), '');
    v_limit := greatest(1, least(coalesce(p_limit, 20), 21));

    IF v_query IS NULL THEN
        RETURN QUERY SELECT
            'input_empty'::text,
            NULL::uuid,
            NULL::public.content_type,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::integer,
            NULL::text,
            NULL::timestamptz,
            NULL::jsonb,
            NULL::real,
            NULL::text,
            NULL::text,
            NULL::text;
        RETURN;
    END IF;

    v_terms := websearch_to_tsquery('english', v_query);

    IF numnode(v_terms) = 0 THEN
        RETURN QUERY SELECT
            'input_empty'::text,
            NULL::uuid,
            NULL::public.content_type,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::integer,
            NULL::text,
            NULL::timestamptz,
            NULL::jsonb,
            NULL::real,
            NULL::text,
            NULL::text,
            NULL::text;
        RETURN;
    END IF;

    RETURN QUERY
    WITH ranked_documents AS (
        SELECT
            d.content_id,
            d.segment_id,
            d.source_order,
            d.snippet_text,
            d.snippet_label,
            ts_rank_cd('{0.05,0.15,0.40,1.00}', d.search_vector, v_terms, 32)::real AS rank
        FROM public.catalog_search_document AS d
        WHERE d.search_vector @@ v_terms
    ),
    best_documents AS (
        SELECT DISTINCT ON (r.content_id)
            r.content_id,
            r.segment_id,
            r.source_order,
            r.snippet_text,
            r.snippet_label,
            r.rank,
            r.rank::numeric AS rank_key
        FROM ranked_documents AS r
        ORDER BY r.content_id, r.rank DESC, r.source_order ASC, r.segment_id ASC NULLS FIRST
    ),
    eligible_results AS (
        SELECT
            b.content_id,
            ci.type,
            ci.title,
            ci.author,
            ci.category,
            ci.cover_image_url,
            ci.duration_seconds,
            ci.audio_url,
            ci.created_at,
            ci.quick_mode_json,
            b.rank,
            b.rank_key,
            b.snippet_label,
            CASE
                WHEN nullif(b.snippet_text, '') IS NULL THEN trim(concat_ws(' ', ci.title, ci.author))
                ELSE ts_headline(
                    'english',
                    b.snippet_text,
                    v_terms,
                    'StartSel=<<NF_HL>>, StopSel=<</NF_HL>>, MaxWords=24, MinWords=12, ShortWord=3, MaxFragments=1'
                )
            END AS snippet_headline
        FROM best_documents AS b
        INNER JOIN public.content_item AS ci ON ci.id = b.content_id
        WHERE ci.status = 'verified'
          AND ci.deleted_at IS NULL
          AND (coalesce(cardinality(p_categories), 0) = 0 OR ci.category = ANY(p_categories))
          AND (p_type IS NULL OR ci.type = p_type)
          AND (
              p_after_rank IS NULL
              OR b.rank_key < p_after_rank
              OR (b.rank_key = p_after_rank AND b.content_id > p_after_content_id)
          )
          AND (
              p_before_rank IS NULL
              OR b.rank_key > p_before_rank
              OR (b.rank_key = p_before_rank AND b.content_id < p_before_content_id)
          )
    )
    SELECT
        'results'::text,
        e.content_id,
        e.type,
        e.title,
        e.author,
        e.category,
        e.cover_image_url,
        e.duration_seconds,
        e.audio_url,
        e.created_at,
        e.quick_mode_json,
        e.rank,
        e.rank_key::text,
        e.snippet_label,
        e.snippet_headline
    FROM eligible_results AS e
    ORDER BY
        CASE WHEN p_before_rank IS NOT NULL THEN e.rank_key END ASC NULLS LAST,
        CASE WHEN p_before_rank IS NOT NULL THEN e.content_id END DESC NULLS LAST,
        CASE WHEN p_before_rank IS NULL THEN e.rank_key END DESC NULLS LAST,
        CASE WHEN p_before_rank IS NULL THEN e.content_id END ASC NULLS LAST
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_catalog(text, text[], public.content_type, numeric, uuid, numeric, uuid, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_catalog(text, text[], public.content_type, numeric, uuid, numeric, uuid, integer)
    TO service_role;
