-- Migration: Restrict media bucket writes to admins only

DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete" ON storage.objects;

DROP POLICY IF EXISTS "Admin media upload" ON storage.objects;
DROP POLICY IF EXISTS "Admin media update" ON storage.objects;
DROP POLICY IF EXISTS "Admin media delete" ON storage.objects;

CREATE POLICY "Admin media upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'media'
    AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

CREATE POLICY "Admin media update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'media'
    AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
)
WITH CHECK (
    bucket_id = 'media'
    AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

CREATE POLICY "Admin media delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'media'
    AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);
