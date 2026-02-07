-- Migration: Create Storage Bucket for Media
-- Creates the 'media' bucket and sets up public access policies.

-- Insert bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Public Read Access
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'media' );

-- Policy: Authenticated Upload Access (Admin Only)
-- Note: 'authenticated' role includes all logged-in users. 
-- Ideally we restrict this further, but for now authenticated is better than anon.
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'media' );

-- Policy: Authenticated Update Access
CREATE POLICY "Authenticated Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'media' );

-- Policy: Authenticated Delete Access
CREATE POLICY "Authenticated Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'media' );
