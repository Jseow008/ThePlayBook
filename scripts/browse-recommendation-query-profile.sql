-- Read-only, representative plans for the semantic branch of
-- public.match_recommendations. The input IDs are selected inside the target
-- database and are never emitted; only EXPLAIN output is returned.
--
-- Cases cover the recent-reading lane (one seed) and a library lane at common
-- and high exclusion counts. Compare Planning Time, Execution Time, buffer
-- reads, and the selected plan node before changing seed or exclusion policy.

BEGIN READ ONLY;

SET LOCAL statement_timeout = '30s';

SELECT 'recent_reading: 1 seed, 1 required exclusion' AS profile_case;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
WITH seed_items AS (
    SELECT ci.id, ci.embedding
    FROM public.content_item ci
    WHERE ci.status = 'verified'
      AND ci.deleted_at IS NULL
      AND ci.embedding IS NOT NULL
    ORDER BY ci.id
    LIMIT 1
),
seed_ids AS (
    SELECT COALESCE(array_agg(seed_items.id), ARRAY[]::uuid[]) AS ids
    FROM seed_items
),
exclude_ids AS (
    SELECT seed_ids.ids
    FROM seed_ids
),
avg_embedding AS (
    SELECT AVG(seed_items.embedding)::extensions.vector(768) AS value
    FROM seed_items
)
SELECT ci.id
FROM public.content_item ci
CROSS JOIN seed_ids
CROSS JOIN exclude_ids
CROSS JOIN avg_embedding
WHERE ci.id != ALL(exclude_ids.ids)
  AND ci.status = 'verified'
  AND ci.deleted_at IS NULL
  AND ci.embedding IS NOT NULL
ORDER BY ci.embedding <=> avg_embedding.value
LIMIT 12;

SELECT 'library: 5 seeds, up to 20 total exclusions' AS profile_case;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
WITH seed_items AS (
    SELECT ci.id, ci.embedding
    FROM public.content_item ci
    WHERE ci.status = 'verified'
      AND ci.deleted_at IS NULL
      AND ci.embedding IS NOT NULL
    ORDER BY ci.id
    LIMIT 5
),
seed_ids AS (
    SELECT COALESCE(array_agg(seed_items.id), ARRAY[]::uuid[]) AS ids
    FROM seed_items
),
exclude_ids AS (
    SELECT (SELECT ids FROM seed_ids) || COALESCE(array_agg(candidate.id), ARRAY[]::uuid[]) AS ids
    FROM (
        SELECT ci.id
        FROM public.content_item ci
        CROSS JOIN seed_ids
        WHERE ci.id != ALL(seed_ids.ids)
        ORDER BY ci.id
        LIMIT 15
    ) candidate
),
avg_embedding AS (
    SELECT AVG(seed_items.embedding)::extensions.vector(768) AS value
    FROM seed_items
)
SELECT ci.id
FROM public.content_item ci
CROSS JOIN seed_ids
CROSS JOIN exclude_ids
CROSS JOIN avg_embedding
WHERE ci.id != ALL(exclude_ids.ids)
  AND ci.status = 'verified'
  AND ci.deleted_at IS NULL
  AND ci.embedding IS NOT NULL
ORDER BY ci.embedding <=> avg_embedding.value
LIMIT 40;

SELECT 'library: 5 seeds, up to 500 total exclusions' AS profile_case;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
WITH seed_items AS (
    SELECT ci.id, ci.embedding
    FROM public.content_item ci
    WHERE ci.status = 'verified'
      AND ci.deleted_at IS NULL
      AND ci.embedding IS NOT NULL
    ORDER BY ci.id
    LIMIT 5
),
seed_ids AS (
    SELECT COALESCE(array_agg(seed_items.id), ARRAY[]::uuid[]) AS ids
    FROM seed_items
),
exclude_ids AS (
    SELECT (SELECT ids FROM seed_ids) || COALESCE(array_agg(candidate.id), ARRAY[]::uuid[]) AS ids
    FROM (
        SELECT ci.id
        FROM public.content_item ci
        CROSS JOIN seed_ids
        WHERE ci.id != ALL(seed_ids.ids)
        ORDER BY ci.id
        LIMIT 495
    ) candidate
),
avg_embedding AS (
    SELECT AVG(seed_items.embedding)::extensions.vector(768) AS value
    FROM seed_items
)
SELECT ci.id
FROM public.content_item ci
CROSS JOIN seed_ids
CROSS JOIN exclude_ids
CROSS JOIN avg_embedding
WHERE ci.id != ALL(exclude_ids.ids)
  AND ci.status = 'verified'
  AND ci.deleted_at IS NULL
  AND ci.embedding IS NOT NULL
ORDER BY ci.embedding <=> avg_embedding.value
LIMIT 40;

ROLLBACK;
