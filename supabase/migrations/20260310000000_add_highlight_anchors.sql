ALTER TABLE user_highlights
ADD COLUMN anchor_start INTEGER,
ADD COLUMN anchor_end INTEGER;

ALTER TABLE user_highlights
ADD CONSTRAINT user_highlights_anchor_pair_check
CHECK (
    (anchor_start IS NULL AND anchor_end IS NULL)
    OR (
        anchor_start IS NOT NULL
        AND anchor_end IS NOT NULL
        AND anchor_start >= 0
        AND anchor_end > anchor_start
    )
);
