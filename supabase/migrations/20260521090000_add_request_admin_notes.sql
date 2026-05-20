-- Request board admin polish
-- Adds public source-availability notes and internal admin notes.

ALTER TABLE content_requests
  ADD COLUMN IF NOT EXISTS source_availability_note TEXT,
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_requests_source_availability_note_length'
      AND conrelid = 'public.content_requests'::regclass
  ) THEN
    ALTER TABLE content_requests
      ADD CONSTRAINT content_requests_source_availability_note_length
      CHECK (source_availability_note IS NULL OR char_length(source_availability_note) <= 1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_requests_admin_note_length'
      AND conrelid = 'public.content_requests'::regclass
  ) THEN
    ALTER TABLE content_requests
      ADD CONSTRAINT content_requests_admin_note_length
      CHECK (admin_note IS NULL OR char_length(admin_note) <= 2000);
  END IF;
END;
$$;
