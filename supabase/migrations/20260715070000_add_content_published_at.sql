-- Treat publication as the first time an item becomes publicly visible, rather
-- than the time its draft row was created. This keeps release ordering stable
-- across edits, narration retries, and future re-publishes.

ALTER TABLE public.content_item
ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Preserve the existing ordering for the current public catalogue. Future
-- releases receive their actual release time from the trigger below.
-- Avoid making every legacy item look newly edited solely because this
-- bookkeeping column is being populated.
ALTER TABLE public.content_item
DISABLE TRIGGER update_content_item_updated_at;

UPDATE public.content_item
SET published_at = created_at
WHERE status = 'verified'
  AND published_at IS NULL;

ALTER TABLE public.content_item
ENABLE TRIGGER update_content_item_updated_at;

CREATE OR REPLACE FUNCTION public.set_content_item_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    -- Once an item has a release time, it is immutable. This also preserves an
    -- explicitly supplied date for imports and migration backfills.
    IF TG_OP = 'UPDATE' AND OLD.published_at IS NOT NULL THEN
        NEW.published_at = OLD.published_at;
        RETURN NEW;
    END IF;

    -- Record the first transition into the public verified state. A verified
    -- import may provide its own timestamp, which is deliberately retained.
    IF NEW.status = 'verified'
       AND NEW.published_at IS NULL
       AND (
           TG_OP = 'INSERT'
           OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'verified')
       ) THEN
        NEW.published_at = now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_content_item_published_at ON public.content_item;

CREATE TRIGGER set_content_item_published_at
BEFORE INSERT OR UPDATE OF status, published_at ON public.content_item
FOR EACH ROW
EXECUTE FUNCTION public.set_content_item_published_at();

REVOKE ALL ON FUNCTION public.set_content_item_published_at() FROM PUBLIC;

CREATE INDEX IF NOT EXISTS idx_content_item_verified_published_at
ON public.content_item (published_at DESC)
WHERE status = 'verified' AND deleted_at IS NULL;

-- The recommendation RPC exposes content metadata to public callers. Recreate
-- it with publication time so both semantic fallbacks and freshness reranking
-- use the release date rather than draft creation date.
DROP FUNCTION IF EXISTS public.match_recommendations(uuid[], uuid[], integer);

CREATE FUNCTION public.match_recommendations(
    seed_ids uuid[],
    exclude_ids uuid[] DEFAULT '{}'::uuid[],
    match_count integer DEFAULT 6
)
RETURNS TABLE(
    id uuid,
    type public.content_type,
    title text,
    source_url text,
    status public.content_status,
    quick_mode_json jsonb,
    duration_seconds integer,
    author text,
    cover_image_url text,
    hero_image_url text,
    category text,
    is_featured boolean,
    audio_url text,
    created_at timestamptz,
    published_at timestamptz,
    updated_at timestamptz,
    deleted_at timestamptz,
    similarity double precision
)
LANGUAGE plpgsql
SET search_path = public, extensions
AS $function$
DECLARE
    avg_embedding extensions.vector(768);
    seed_cats text[];
BEGIN
    SELECT AVG(ci.embedding)::extensions.vector(768) INTO avg_embedding
    FROM public.content_item ci
    WHERE ci.id = ANY(seed_ids)
      AND ci.embedding IS NOT NULL;

    IF avg_embedding IS NULL THEN
        SELECT array_agg(DISTINCT ci.category) INTO seed_cats
        FROM public.content_item ci
        WHERE ci.id = ANY(seed_ids)
          AND ci.category IS NOT NULL;

        IF seed_cats IS NOT NULL AND array_length(seed_cats, 1) > 0 THEN
            RETURN QUERY
            SELECT
                ci.id, ci.type, ci.title, ci.source_url, ci.status, ci.quick_mode_json,
                ci.duration_seconds, ci.author, ci.cover_image_url, ci.hero_image_url,
                ci.category, ci.is_featured, ci.audio_url, ci.created_at, ci.published_at,
                ci.updated_at, ci.deleted_at, 0::double precision AS similarity
            FROM public.content_item ci
            WHERE ci.id != ALL(exclude_ids)
              AND ci.status = 'verified'
              AND ci.deleted_at IS NULL
              AND ci.category = ANY(seed_cats)
            ORDER BY ci.published_at DESC
            LIMIT match_count;
        END IF;

        RETURN QUERY
        SELECT
            ci.id, ci.type, ci.title, ci.source_url, ci.status, ci.quick_mode_json,
            ci.duration_seconds, ci.author, ci.cover_image_url, ci.hero_image_url,
            ci.category, ci.is_featured, ci.audio_url, ci.created_at, ci.published_at,
            ci.updated_at, ci.deleted_at, 0::double precision AS similarity
        FROM public.content_item ci
        WHERE ci.id != ALL(exclude_ids)
          AND ci.status = 'verified'
          AND ci.deleted_at IS NULL
        ORDER BY ci.published_at DESC
        LIMIT match_count;

        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        ci.id,
        ci.type,
        ci.title,
        ci.source_url,
        ci.status,
        ci.quick_mode_json,
        ci.duration_seconds,
        ci.author,
        ci.cover_image_url,
        ci.hero_image_url,
        ci.category,
        ci.is_featured,
        ci.audio_url,
        ci.created_at,
        ci.published_at,
        ci.updated_at,
        ci.deleted_at,
        1 - (ci.embedding OPERATOR(extensions.<=>) avg_embedding) AS similarity
    FROM public.content_item ci
    WHERE ci.id != ALL(exclude_ids)
      AND ci.status = 'verified'
      AND ci.deleted_at IS NULL
      AND ci.embedding IS NOT NULL
    ORDER BY ci.embedding OPERATOR(extensions.<=>) avg_embedding
    LIMIT match_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.match_recommendations(uuid[], uuid[], integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_recommendations(uuid[], uuid[], integer)
TO anon, authenticated, service_role;

-- Homepage sections use the same release-date definition as the primary Browse
-- lane. Keep the public RPC as an invoker function with its existing grants.
CREATE OR REPLACE FUNCTION public.get_homepage_sections_with_items(
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    section_id uuid,
    section_title text,
    filter_type_out text,
    filter_value_out text,
    order_index_out integer,
    is_active_out boolean,
    items jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_section record;
    v_items jsonb;
BEGIN
    FOR v_section IN (
        SELECT id, title, filter_type, filter_value, order_index, is_active
        FROM homepage_section
        WHERE is_active = true
        ORDER BY order_index
    ) LOOP
        IF v_section.filter_type = 'author' THEN
            SELECT jsonb_agg(t) INTO v_items FROM (
                SELECT id, type, title, source_url, status, quick_mode_json, duration_seconds,
                    author, cover_image_url, hero_image_url, category, is_featured, audio_url,
                    created_at, published_at, updated_at, deleted_at
                FROM content_item
                WHERE status = 'verified'
                  AND deleted_at IS NULL
                  AND author ILIKE '%' || v_section.filter_value || '%'
                ORDER BY published_at DESC
                LIMIT p_limit
            ) t;
        ELSIF v_section.filter_type = 'title' THEN
            SELECT jsonb_agg(t) INTO v_items FROM (
                SELECT id, type, title, source_url, status, quick_mode_json, duration_seconds,
                    author, cover_image_url, hero_image_url, category, is_featured, audio_url,
                    created_at, published_at, updated_at, deleted_at
                FROM content_item
                WHERE status = 'verified'
                  AND deleted_at IS NULL
                  AND title ILIKE '%' || v_section.filter_value || '%'
                ORDER BY published_at DESC
                LIMIT p_limit
            ) t;
        ELSIF v_section.filter_type = 'category' THEN
            SELECT jsonb_agg(t) INTO v_items FROM (
                SELECT id, type, title, source_url, status, quick_mode_json, duration_seconds,
                    author, cover_image_url, hero_image_url, category, is_featured, audio_url,
                    created_at, published_at, updated_at, deleted_at
                FROM content_item
                WHERE status = 'verified'
                  AND deleted_at IS NULL
                  AND category = v_section.filter_value
                ORDER BY published_at DESC
                LIMIT p_limit
            ) t;
        ELSIF v_section.filter_type = 'featured' THEN
            SELECT jsonb_agg(t) INTO v_items FROM (
                SELECT id, type, title, source_url, status, quick_mode_json, duration_seconds,
                    author, cover_image_url, hero_image_url, category, is_featured, audio_url,
                    created_at, published_at, updated_at, deleted_at
                FROM content_item
                WHERE status = 'verified'
                  AND deleted_at IS NULL
                  AND is_featured = true
                ORDER BY published_at DESC
                LIMIT p_limit
            ) t;
        ELSE
            SELECT jsonb_agg(t) INTO v_items FROM (
                SELECT id, type, title, source_url, status, quick_mode_json, duration_seconds,
                    author, cover_image_url, hero_image_url, category, is_featured, audio_url,
                    created_at, published_at, updated_at, deleted_at
                FROM content_item
                WHERE status = 'verified'
                  AND deleted_at IS NULL
                ORDER BY published_at DESC
                LIMIT p_limit
            ) t;
        END IF;

        section_id := v_section.id;
        section_title := v_section.title;
        filter_type_out := v_section.filter_type;
        filter_value_out := v_section.filter_value;
        order_index_out := v_section.order_index;
        is_active_out := v_section.is_active;
        items := COALESCE(v_items, '[]'::jsonb);
        RETURN NEXT;
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_homepage_sections_with_items(integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_homepage_sections_with_items(integer)
TO anon, authenticated, service_role;
