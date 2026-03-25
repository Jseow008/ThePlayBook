-- Add reusable content series support and seed the Matthew pilot series.

CREATE TABLE IF NOT EXISTS public.content_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_item
    ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.content_series(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS series_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_content_item_series_id
    ON public.content_item (series_id)
    WHERE series_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_item_series_order_unique
    ON public.content_item (series_id, series_order)
    WHERE series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_item_series_id_order
    ON public.content_item (series_id, series_order)
    WHERE series_id IS NOT NULL;

ALTER TABLE public.content_series ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'content_series'
          AND policyname = 'Public can read content series'
    ) THEN
        CREATE POLICY "Public can read content series"
            ON public.content_series
            FOR SELECT
            USING (true);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'content_series'
          AND policyname = 'Service role has full access to content_series'
    ) THEN
        CREATE POLICY "Service role has full access to content_series"
            ON public.content_series
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_content_series_updated_at'
    ) THEN
        CREATE TRIGGER update_content_series_updated_at
            BEFORE UPDATE ON public.content_series
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_content_graph(
    p_content_id uuid,
    p_content_patch jsonb DEFAULT '{}'::jsonb,
    p_segments jsonb DEFAULT NULL,
    p_artifacts jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_content_id IS NULL THEN
        RAISE EXCEPTION 'p_content_id is required';
    END IF;

    IF p_content_patch IS NOT NULL AND p_content_patch <> '{}'::jsonb THEN
        UPDATE public.content_item
        SET
            title = CASE WHEN p_content_patch ? 'title' THEN NULLIF(p_content_patch->>'title', '') ELSE title END,
            author = CASE WHEN p_content_patch ? 'author' THEN NULLIF(p_content_patch->>'author', '') ELSE author END,
            type = CASE WHEN p_content_patch ? 'type' THEN (p_content_patch->>'type')::content_type ELSE type END,
            category = CASE WHEN p_content_patch ? 'category' THEN NULLIF(p_content_patch->>'category', '') ELSE category END,
            source_url = CASE WHEN p_content_patch ? 'source_url' THEN NULLIF(p_content_patch->>'source_url', '') ELSE source_url END,
            cover_image_url = CASE WHEN p_content_patch ? 'cover_image_url' THEN NULLIF(p_content_patch->>'cover_image_url', '') ELSE cover_image_url END,
            hero_image_url = CASE WHEN p_content_patch ? 'hero_image_url' THEN NULLIF(p_content_patch->>'hero_image_url', '') ELSE hero_image_url END,
            audio_url = CASE WHEN p_content_patch ? 'audio_url' THEN NULLIF(p_content_patch->>'audio_url', '') ELSE audio_url END,
            duration_seconds = CASE
                WHEN p_content_patch ? 'duration_seconds' AND p_content_patch->>'duration_seconds' IS NOT NULL
                    THEN NULLIF(p_content_patch->>'duration_seconds', '')::int
                WHEN p_content_patch ? 'duration_seconds' THEN NULL
                ELSE duration_seconds
            END,
            status = CASE WHEN p_content_patch ? 'status' THEN (p_content_patch->>'status')::content_status ELSE status END,
            is_featured = CASE WHEN p_content_patch ? 'is_featured' THEN (p_content_patch->>'is_featured')::boolean ELSE is_featured END,
            quick_mode_json = CASE
                WHEN p_content_patch ? 'quick_mode_json' THEN p_content_patch->'quick_mode_json'
                ELSE quick_mode_json
            END,
            series_id = CASE
                WHEN p_content_patch ? 'series_id' AND NULLIF(p_content_patch->>'series_id', '') IS NOT NULL
                    THEN (p_content_patch->>'series_id')::uuid
                WHEN p_content_patch ? 'series_id' THEN NULL
                ELSE series_id
            END,
            series_order = CASE
                WHEN p_content_patch ? 'series_order' AND p_content_patch->>'series_order' IS NOT NULL
                    THEN NULLIF(p_content_patch->>'series_order', '')::int
                WHEN p_content_patch ? 'series_order' THEN NULL
                ELSE series_order
            END,
            updated_at = now()
        WHERE id = p_content_id;
    END IF;

    IF p_segments IS NOT NULL THEN
        DELETE FROM public.segment WHERE item_id = p_content_id;

        INSERT INTO public.segment (
            id,
            item_id,
            order_index,
            title,
            markdown_body,
            start_time_sec,
            end_time_sec,
            updated_at
        )
        SELECT
            (x.id)::uuid,
            p_content_id,
            x.order_index,
            NULLIF(x.title, ''),
            x.markdown_body,
            x.start_time_sec,
            x.end_time_sec,
            now()
        FROM jsonb_to_recordset(COALESCE(p_segments, '[]'::jsonb)) AS x(
            id text,
            order_index int,
            title text,
            markdown_body text,
            start_time_sec int,
            end_time_sec int
        )
        WHERE x.id IS NOT NULL;

        INSERT INTO public.segment (
            item_id,
            order_index,
            title,
            markdown_body,
            start_time_sec,
            end_time_sec,
            updated_at
        )
        SELECT
            p_content_id,
            x.order_index,
            NULLIF(x.title, ''),
            x.markdown_body,
            x.start_time_sec,
            x.end_time_sec,
            now()
        FROM jsonb_to_recordset(COALESCE(p_segments, '[]'::jsonb)) AS x(
            id text,
            order_index int,
            title text,
            markdown_body text,
            start_time_sec int,
            end_time_sec int
        )
        WHERE x.id IS NULL;
    END IF;

    IF p_artifacts IS NOT NULL THEN
        DELETE FROM public.artifact WHERE item_id = p_content_id;

        INSERT INTO public.artifact (
            item_id,
            type,
            payload_schema,
            version,
            updated_at
        )
        SELECT
            p_content_id,
            (x.type)::artifact_type,
            x.payload_schema,
            COALESCE(NULLIF(x.version, ''), '1.0.0'),
            now()
        FROM jsonb_to_recordset(COALESCE(p_artifacts, '[]'::jsonb)) AS x(
            type text,
            payload_schema jsonb,
            version text
        );
    END IF;
END;
$$;

INSERT INTO public.content_series (slug, title, description)
VALUES (
    'matthew',
    'Matthew',
    'The Gospel of Matthew, ordered as a reading sequence across multiple content cards.'
)
ON CONFLICT (slug) DO UPDATE
SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    updated_at = now();

WITH matthew_series AS (
    SELECT id
    FROM public.content_series
    WHERE slug = 'matthew'
),
title_map(title, series_order) AS (
    VALUES
        ('Matthew 1-4: Birth, Baptism, and Kingdom Announcement', 1),
        ('Matthew 5-7: Sermon on the Mount', 2),
        ('Matthew 8-12: Miracles, Authority, and Rising Opposition', 3),
        ('Matthew 13: Kingdom Parables', 4),
        ('Matthew 14-20: Power, Discipleship, and the Road to Jerusalem', 5),
        ('Matthew 21-23: Jerusalem and Final Confrontations', 6),
        ('Matthew 24-25: The Olivet Discourse', 7),
        ('Matthew 26-28: Death, Resurrection, and the Great Commission', 8)
)
UPDATE public.content_item ci
SET
    series_id = ms.id,
    series_order = tm.series_order,
    updated_at = now()
FROM matthew_series ms
CROSS JOIN title_map tm
WHERE ci.title = tm.title;
