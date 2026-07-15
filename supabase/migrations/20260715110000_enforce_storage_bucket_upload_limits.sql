-- Keep Storage-side upload limits aligned with the existing admin API contracts.
-- Fail closed if current production-shaped data would be rejected by the limits.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

DO $$
DECLARE
    missing_buckets text;
    incompatible_objects text;
BEGIN
    WITH expected_buckets(bucket_id) AS (
        VALUES ('media'), ('audio')
    )
    SELECT string_agg(expected.bucket_id, ', ' ORDER BY expected.bucket_id)
    INTO missing_buckets
    FROM expected_buckets expected
    LEFT JOIN storage.buckets bucket
        ON bucket.id = expected.bucket_id
    WHERE bucket.id IS NULL;

    IF missing_buckets IS NOT NULL THEN
        RAISE EXCEPTION 'Required Storage buckets are missing: %', missing_buckets;
    END IF;

    WITH expected_buckets(bucket_id, file_size_limit, allowed_mime_types) AS (
        VALUES
            (
                'media',
                5 * 1024 * 1024::bigint,
                ARRAY[
                    'image/jpeg',
                    'image/png',
                    'image/webp',
                    'image/gif',
                    'image/avif'
                ]::text[]
            ),
            (
                'audio',
                50 * 1024 * 1024::bigint,
                ARRAY[
                    'audio/mpeg',
                    'audio/mp3',
                    'audio/wav',
                    'audio/x-m4a',
                    'audio/m4a'
                ]::text[]
            )
    ),
    violations AS (
        SELECT
            object.bucket_id,
            count(*) AS violation_count
        FROM storage.objects object
        JOIN expected_buckets expected
            ON expected.bucket_id = object.bucket_id
        WHERE coalesce((object.metadata ->> 'size')::bigint, 0) > expected.file_size_limit
           OR NOT (
               coalesce(object.metadata ->> 'mimetype', '')
               = ANY(expected.allowed_mime_types)
           )
        GROUP BY object.bucket_id
    )
    SELECT string_agg(
        format('%I (%s object(s))', bucket_id, violation_count),
        ', '
        ORDER BY bucket_id
    )
    INTO incompatible_objects
    FROM violations;

    IF incompatible_objects IS NOT NULL THEN
        RAISE EXCEPTION
            'Existing Storage objects are incompatible with the proposed bucket limits: %',
            incompatible_objects;
    END IF;

    UPDATE storage.buckets
    SET
        file_size_limit = 5 * 1024 * 1024,
        allowed_mime_types = ARRAY[
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/avif'
        ]::text[],
        updated_at = now()
    WHERE id = 'media'
      AND (
          file_size_limit IS DISTINCT FROM 5 * 1024 * 1024
          OR allowed_mime_types IS DISTINCT FROM ARRAY[
              'image/jpeg',
              'image/png',
              'image/webp',
              'image/gif',
              'image/avif'
          ]::text[]
      );

    UPDATE storage.buckets
    SET
        file_size_limit = 50 * 1024 * 1024,
        allowed_mime_types = ARRAY[
            'audio/mpeg',
            'audio/mp3',
            'audio/wav',
            'audio/x-m4a',
            'audio/m4a'
        ]::text[],
        updated_at = now()
    WHERE id = 'audio'
      AND (
          file_size_limit IS DISTINCT FROM 50 * 1024 * 1024
          OR allowed_mime_types IS DISTINCT FROM ARRAY[
              'audio/mpeg',
              'audio/mp3',
              'audio/wav',
              'audio/x-m4a',
              'audio/m4a'
          ]::text[]
      );
END;
$$;
