ALTER TABLE public.content_item
    ADD COLUMN narration_segments_completed integer NOT NULL DEFAULT 0,
    ADD COLUMN narration_segments_total integer,
    ADD COLUMN narration_progress_at timestamptz;

ALTER TABLE public.content_item
    ADD CONSTRAINT content_item_narration_segment_progress_check
    CHECK (
        narration_segments_completed >= 0
        AND (
            (narration_segments_total IS NULL AND narration_segments_completed = 0)
            OR (
                narration_segments_total IS NOT NULL
                AND narration_segments_total >= 0
                AND narration_segments_completed <= narration_segments_total
            )
        )
    );
