-- Phase 1 #12/#13: a private, transaction-maintained lexical search
-- projection for the public catalog. The projection is deliberately not a
-- Data API surface; callers use the narrow search_catalog RPC below.

CREATE TABLE public.catalog_search_document (
    source_kind text NOT NULL CHECK (source_kind IN ('metadata', 'segment')),
    source_id uuid NOT NULL,
    content_id uuid NOT NULL REFERENCES public.content_item(id) ON DELETE CASCADE,
    segment_id uuid REFERENCES public.segment(id) ON DELETE CASCADE,
    source_order integer NOT NULL,
    search_vector tsvector NOT NULL,
    snippet_text text NOT NULL,
    snippet_label text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    PRIMARY KEY (source_kind, source_id),
    CHECK (
        (source_kind = 'metadata' AND segment_id IS NULL AND source_id = content_id)
        OR (source_kind = 'segment' AND segment_id IS NOT NULL AND source_id = segment_id)
    )
);

ALTER TABLE public.catalog_search_document ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalog_search_document FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_search_document TO service_role;
-- The projection is intentionally private even if a future grant is added by
-- mistake. Its only public access path is the fixed search_catalog RPC.
CREATE POLICY catalog_search_document_no_direct_browser_access
ON public.catalog_search_document
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE INDEX catalog_search_document_vector_idx
    ON public.catalog_search_document
    USING gin (search_vector);

CREATE INDEX catalog_search_document_content_idx
    ON public.catalog_search_document (content_id, source_order, source_id);

-- Keep index terms and returned snippets as plain text. The expression is
-- intentionally conservative: it removes Markdown syntax and URL targets,
-- but never returns database-provided markup to the browser.
CREATE OR REPLACE FUNCTION public.catalog_search_plain_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT trim(
        regexp_replace(
            regexp_replace(
                regexp_replace(
                    coalesce(p_value, ''),
                    E'!?\\[([^]]*)\\]\\([^)]*\\)', E'\\1', 'g'
                ),
                '<[^>]+>', ' ', 'g'
            ),
            '[`*_#>~]+', ' ', 'g'
        )
    );
$$;

REVOKE ALL ON FUNCTION public.catalog_search_plain_text(text)
    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_catalog_search_documents(p_content_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_content public.content_item%ROWTYPE;
    v_key_takeaways text;
    v_summary_text text;
BEGIN
    DELETE FROM public.catalog_search_document
    WHERE content_id = p_content_id;

    SELECT * INTO v_content
    FROM public.content_item
    WHERE id = p_content_id
      AND status = 'verified'
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT coalesce(string_agg(public.catalog_search_plain_text(value), ' '), '')
    INTO v_key_takeaways
    FROM jsonb_array_elements_text(
        CASE
            WHEN jsonb_typeof(v_content.quick_mode_json -> 'key_takeaways') = 'array'
                THEN v_content.quick_mode_json -> 'key_takeaways'
            ELSE '[]'::jsonb
        END
    ) AS takeaway(value);

    v_summary_text := trim(concat_ws(' ',
        public.catalog_search_plain_text(v_content.quick_mode_json ->> 'big_idea'),
        public.catalog_search_plain_text(v_content.quick_mode_json ->> 'hook'),
        v_key_takeaways,
        public.catalog_search_plain_text(v_content.title),
        public.catalog_search_plain_text(v_content.author)
    ));

    INSERT INTO public.catalog_search_document (
        source_kind,
        source_id,
        content_id,
        segment_id,
        source_order,
        search_vector,
        snippet_text,
        snippet_label
    )
    VALUES (
        'metadata',
        v_content.id,
        v_content.id,
        NULL,
        0,
        setweight(to_tsvector('english', public.catalog_search_plain_text(v_content.title)), 'A')
        || setweight(to_tsvector('english', public.catalog_search_plain_text(v_content.quick_mode_json ->> 'big_idea')), 'A')
        || setweight(to_tsvector('english', public.catalog_search_plain_text(v_content.author)), 'B')
        || setweight(to_tsvector('english', public.catalog_search_plain_text(v_content.quick_mode_json ->> 'hook')), 'B')
        || setweight(to_tsvector('english', public.catalog_search_plain_text(v_content.category)), 'C')
        || setweight(to_tsvector('english', v_key_takeaways), 'C'),
        coalesce(nullif(v_summary_text, ''), public.catalog_search_plain_text(v_content.title)),
        'Summary'
    );

    INSERT INTO public.catalog_search_document (
        source_kind,
        source_id,
        content_id,
        segment_id,
        source_order,
        search_vector,
        snippet_text,
        snippet_label
    )
    SELECT
        'segment',
        s.id,
        s.item_id,
        s.id,
        s.order_index + 1,
        setweight(to_tsvector('english', public.catalog_search_plain_text(s.title)), 'B')
        || setweight(to_tsvector('english', public.catalog_search_plain_text(s.markdown_body)), 'D'),
        public.catalog_search_plain_text(s.markdown_body),
        coalesce(nullif(public.catalog_search_plain_text(s.title), ''), 'Summary')
    FROM public.segment AS s
    WHERE s.item_id = v_content.id
      AND s.deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_catalog_search_documents_from_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_catalog_search_documents(OLD.id);
        RETURN OLD;
    END IF;

    PERFORM public.refresh_catalog_search_documents(NEW.id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_catalog_search_documents_from_segment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_catalog_search_documents(OLD.item_id);
        RETURN OLD;
    END IF;

    PERFORM public.refresh_catalog_search_documents(NEW.item_id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER refresh_catalog_search_documents_after_content_change
AFTER INSERT OR UPDATE OF title, author, category, quick_mode_json, status, deleted_at OR DELETE
ON public.content_item
FOR EACH ROW
EXECUTE FUNCTION public.refresh_catalog_search_documents_from_content();

CREATE TRIGGER refresh_catalog_search_documents_after_segment_change
AFTER INSERT OR UPDATE OF title, markdown_body, deleted_at, order_index OR DELETE
ON public.segment
FOR EACH ROW
EXECUTE FUNCTION public.refresh_catalog_search_documents_from_segment();

-- Backfill current eligible content. The trigger-maintained projection then
-- keeps eligibility and source text current in every later transaction.
SELECT public.refresh_catalog_search_documents(id)
FROM public.content_item;

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

REVOKE ALL ON FUNCTION public.refresh_catalog_search_documents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_catalog_search_documents_from_content() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_catalog_search_documents_from_segment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_catalog(text, text[], public.content_type, numeric, uuid, numeric, uuid, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_catalog(text, text[], public.content_type, numeric, uuid, numeric, uuid, integer)
    TO anon, authenticated;

-- Notes stays account-bound. This invoker function deliberately has no
-- SECURITY DEFINER privilege: auth.uid() and RLS remain the authorization
-- boundary, while the fixed projection keeps all filtering ahead of paging.
CREATE OR REPLACE FUNCTION public.search_user_highlights(
    p_query text,
    p_content_item_id uuid,
    p_item_type text,
    p_color text,
    p_sort text,
    p_after_created_at timestamptz,
    p_after_id uuid,
    p_limit integer
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    content_item_id uuid,
    segment_id uuid,
    anchor_start integer,
    anchor_end integer,
    highlighted_text text,
    note_body text,
    color text,
    created_at timestamptz,
    cursor_created_at text,
    updated_at timestamptz,
    content_title text,
    content_author text,
    content_cover_image_url text,
    segment_title text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
    WITH normalized_query AS (
        SELECT replace(
            replace(
                replace(nullif(trim(coalesce(p_query, '')), ''), E'\\', E'\\\\'),
                '%', E'\\%'
            ),
            '_', E'\\_'
        ) AS literal_query
    ), scoped_highlights AS (
        SELECT
            h.id,
            h.user_id,
            h.content_item_id,
            h.segment_id,
            h.anchor_start,
            h.anchor_end,
            h.highlighted_text,
            h.note_body,
            h.color,
            h.created_at,
            h.created_at::text AS cursor_created_at,
            h.updated_at,
            ci.title AS content_title,
            ci.author AS content_author,
            ci.cover_image_url AS content_cover_image_url,
            s.title AS segment_title
        FROM public.user_highlights AS h
        LEFT JOIN public.content_item AS ci ON ci.id = h.content_item_id
        LEFT JOIN public.segment AS s ON s.id = h.segment_id
        CROSS JOIN normalized_query AS q
        WHERE h.user_id = auth.uid()
          AND (p_content_item_id IS NULL OR h.content_item_id = p_content_item_id)
          AND (p_color IS NULL OR h.color = p_color)
          AND (
              p_item_type IS NULL
              OR (p_item_type = 'note' AND nullif(trim(coalesce(h.note_body, '')), '') IS NOT NULL)
              OR (p_item_type = 'highlight' AND nullif(trim(coalesce(h.note_body, '')), '') IS NULL)
          )
          AND (
              q.literal_query IS NULL
              OR h.highlighted_text ILIKE '%' || q.literal_query || '%' ESCAPE E'\\'
              OR h.note_body ILIKE '%' || q.literal_query || '%' ESCAPE E'\\'
              OR ci.title ILIKE '%' || q.literal_query || '%' ESCAPE E'\\'
              OR ci.author ILIKE '%' || q.literal_query || '%' ESCAPE E'\\'
              OR s.title ILIKE '%' || q.literal_query || '%' ESCAPE E'\\'
          )
          AND (
              p_after_created_at IS NULL
              OR (
                  p_sort = 'oldest'
                  AND (h.created_at, h.id) > (p_after_created_at, p_after_id)
              )
              OR (
                  p_sort <> 'oldest'
                  AND (
                      h.created_at < p_after_created_at
                      OR (h.created_at = p_after_created_at AND h.id > p_after_id)
                  )
              )
          )
    )
    SELECT *
    FROM scoped_highlights
    ORDER BY
        CASE WHEN p_sort = 'oldest' THEN created_at END ASC,
        CASE WHEN p_sort = 'oldest' THEN id END ASC,
        CASE WHEN p_sort <> 'oldest' THEN created_at END DESC,
        CASE WHEN p_sort <> 'oldest' THEN id END ASC
    -- The reader already requests up to 50 highlights. Keep an extra row for
    -- keyset continuation without silently truncating that existing consumer.
    LIMIT greatest(1, least(coalesce(p_limit, 30), 101));
$$;

REVOKE ALL ON FUNCTION public.search_user_highlights(text, uuid, text, text, text, timestamptz, uuid, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_user_highlights(text, uuid, text, text, text, timestamptz, uuid, integer)
    TO authenticated;
