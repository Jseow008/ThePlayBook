-- Public buckets can serve known object URLs without broad storage.objects
-- SELECT policies. Drop listing-capable public read policies while keeping
-- the media/audio buckets public for existing stored URLs.

UPDATE storage.buckets
SET public = true
WHERE id IN ('media', 'audio');

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public audio read" ON storage.objects;
