ALTER TABLE public.content_item
DROP CONSTRAINT IF EXISTS content_item_narration_status_check;

ALTER TABLE public.content_item
ADD CONSTRAINT content_item_narration_status_check
CHECK (narration_status IN ('idle', 'queued', 'processing', 'ready', 'failed', 'stale'));
