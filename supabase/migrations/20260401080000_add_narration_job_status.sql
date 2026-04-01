-- Persist AI narration generation state directly on content_item so admin
-- can queue work and poll status without holding a long request open.

ALTER TABLE public.content_item
ADD COLUMN IF NOT EXISTS narration_status TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS narration_error TEXT,
ADD COLUMN IF NOT EXISTS narration_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS narration_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS narration_completed_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'content_item_narration_status_check'
    ) THEN
        ALTER TABLE public.content_item
        ADD CONSTRAINT content_item_narration_status_check
        CHECK (narration_status IN ('idle', 'queued', 'processing', 'ready', 'failed'));
    END IF;
END
$$;

UPDATE public.content_item
SET
    narration_status = 'ready',
    narration_completed_at = COALESCE(narration_completed_at, updated_at, NOW()),
    narration_error = NULL
WHERE audio_url IS NOT NULL
  AND narration_status = 'idle';

CREATE INDEX IF NOT EXISTS idx_content_item_narration_queue
    ON public.content_item (narration_status, narration_requested_at)
    WHERE deleted_at IS NULL;
