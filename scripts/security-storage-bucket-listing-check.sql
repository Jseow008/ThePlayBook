DO $$
DECLARE
  failures text;
BEGIN
  WITH expected_buckets(bucket_id) AS (
    VALUES ('media'), ('audio')
  ),
  bucket_violations AS (
    SELECT
      format('storage_bucket_missing_or_not_public: %I', expected.bucket_id) AS failure
    FROM expected_buckets expected
    LEFT JOIN storage.buckets bucket
      ON bucket.id = expected.bucket_id
    WHERE bucket.id IS NULL
       OR bucket.public IS NOT TRUE
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
