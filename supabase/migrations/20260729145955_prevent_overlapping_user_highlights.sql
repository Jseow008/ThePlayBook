-- Preserve legacy overlaps for review while preventing any new overlapping
-- anchored highlights. The transaction-scoped advisory lock serializes writes
-- for a single user and segment so concurrent requests cannot race the check.

CREATE INDEX IF NOT EXISTS idx_user_highlights_user_segment_anchor_range
    ON public.user_highlights (user_id, segment_id, anchor_start, anchor_end)
    WHERE segment_id IS NOT NULL
      AND anchor_start IS NOT NULL
      AND anchor_end IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_overlapping_user_highlights()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.segment_id IS NULL
       OR NEW.anchor_start IS NULL
       OR NEW.anchor_end IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            NEW.user_id::text || ':' || NEW.segment_id::text,
            0
        )
    );

    IF EXISTS (
        SELECT 1
        FROM public.user_highlights AS existing
        WHERE existing.user_id = NEW.user_id
          AND existing.segment_id = NEW.segment_id
          AND existing.id IS DISTINCT FROM NEW.id
          AND existing.anchor_start IS NOT NULL
          AND existing.anchor_end IS NOT NULL
          AND existing.anchor_start < NEW.anchor_end
          AND existing.anchor_end > NEW.anchor_start
    ) THEN
        RAISE EXCEPTION 'highlight range overlaps an existing highlight'
            USING ERRCODE = '23P01';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_overlapping_user_highlights() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_overlapping_user_highlights() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_overlapping_user_highlights() FROM authenticated;

DROP TRIGGER IF EXISTS prevent_overlapping_user_highlights
    ON public.user_highlights;

CREATE TRIGGER prevent_overlapping_user_highlights
BEFORE INSERT OR UPDATE OF user_id, segment_id, anchor_start, anchor_end
ON public.user_highlights
FOR EACH ROW
EXECUTE FUNCTION public.prevent_overlapping_user_highlights();
