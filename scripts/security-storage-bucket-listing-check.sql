DO $$
DECLARE
  failures text;
BEGIN
  WITH expected_buckets(bucket_id, file_size_limit, allowed_mime_types) AS (
    VALUES
      (
        'media',
        5 * 1024 * 1024::bigint,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']::text[]
      ),
      (
        'audio',
        50 * 1024 * 1024::bigint,
        ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-m4a', 'audio/m4a']::text[]
      )
  ),
  bucket_violations AS (
    SELECT
      format('storage_bucket_configuration_drift: %I', expected.bucket_id) AS failure
    FROM expected_buckets expected
    LEFT JOIN storage.buckets bucket
      ON bucket.id = expected.bucket_id
    WHERE bucket.id IS NULL
       OR bucket.public IS NOT TRUE
       OR bucket.file_size_limit IS DISTINCT FROM expected.file_size_limit
       OR bucket.allowed_mime_types IS DISTINCT FROM expected.allowed_mime_types
  ),
  incompatible_objects AS (
    SELECT
      format('storage_object_outside_bucket_contract: %I (%s object(s))', object.bucket_id, count(*)) AS failure
    FROM storage.objects object
    JOIN expected_buckets expected
      ON expected.bucket_id = object.bucket_id
    WHERE coalesce((object.metadata ->> 'size')::bigint, 0) > expected.file_size_limit
       OR NOT (
         coalesce(object.metadata ->> 'mimetype', '')
         = ANY(expected.allowed_mime_types)
       )
    GROUP BY object.bucket_id
  ),
  forbidden_named_policies AS (
    SELECT
      format('forbidden_storage_listing_policy_exists: %I', policyname) AS failure
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN ('Public Access', 'Public audio read')
  ),
  broad_public_select_policies AS (
    SELECT
      format('broad_public_storage_select_policy: %I (%s)', policyname, qual) AS failure
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd = 'SELECT'
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
      AND (
        qual ILIKE '%bucket_id = ''media''%'
        OR qual ILIKE '%bucket_id = ''audio''%'
      )
      AND qual NOT ILIKE '%storage.allow_only_operation%'
      AND qual NOT ILIKE '%storage.allow_any_operation%'
  ),
  expected_admin_policies(policyname, command) AS (
    VALUES
      ('Admin media upload', 'INSERT'),
      ('Admin media update', 'UPDATE'),
      ('Admin media delete', 'DELETE'),
      ('Admin audio upload', 'INSERT'),
      ('Admin audio update', 'UPDATE'),
      ('Admin audio delete', 'DELETE')
  ),
  admin_policy_violations AS (
    SELECT
      format('missing_admin_storage_policy: %I %s', expected.policyname, expected.command) AS failure
    FROM expected_admin_policies expected
    LEFT JOIN pg_policies policy
      ON policy.schemaname = 'storage'
     AND policy.tablename = 'objects'
     AND policy.policyname = expected.policyname
     AND policy.cmd = expected.command
    WHERE policy.policyname IS NULL
  ),
  all_failures AS (
    SELECT failure FROM bucket_violations
    UNION ALL
    SELECT failure FROM incompatible_objects
    UNION ALL
    SELECT failure FROM forbidden_named_policies
    UNION ALL
    SELECT failure FROM broad_public_select_policies
    UNION ALL
    SELECT failure FROM admin_policy_violations
  )
  SELECT string_agg(failure, E'\n' ORDER BY failure)
  INTO failures
  FROM all_failures;

  IF failures IS NOT NULL THEN
    RAISE EXCEPTION 'Storage bucket listing security drift detected:%', E'\n' || failures;
  END IF;
END;
$$;
