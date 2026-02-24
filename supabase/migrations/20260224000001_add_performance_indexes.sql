-- Migration 20260224000001
-- Add reverse lookup indexes for frequently queried foreign keys
-- This helps when joining or filtering from the child up to the parent.

CREATE INDEX IF NOT EXISTS idx_user_library_content_id ON public.user_library(content_id);
CREATE INDEX IF NOT EXISTS idx_reading_activity_activity_date ON public.reading_activity(activity_date);
CREATE INDEX IF NOT EXISTS idx_content_feedback_content_id ON public.content_feedback(content_id);
