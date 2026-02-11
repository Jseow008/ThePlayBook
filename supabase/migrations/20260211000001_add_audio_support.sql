-- Migration: Add audio support to content items and storage

-- Add optional audio URL for content playback.
ALTER TABLE public.content_item
ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- Create public audio bucket if missing.
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Replace existing audio policies to keep migration idempotent.
DROP POLICY IF EXISTS "Public audio read" ON storage.objects;
DROP POLICY IF EXISTS "Admin audio upload" ON storage.objects;
DROP POLICY IF EXISTS "Admin audio update" ON storage.objects;
DROP POLICY IF EXISTS "Admin audio delete" ON storage.objects;

-- Anyone can stream audio assets.
CREATE POLICY "Public audio read"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio');

-- Only authenticated admins can upload/update/delete audio objects.
CREATE POLICY "Admin audio upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'audio'
    AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

CREATE POLICY "Admin audio update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'audio'
    AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
)
WITH CHECK (
    bucket_id = 'audio'
    AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

CREATE POLICY "Admin audio delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'audio'
    AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);
