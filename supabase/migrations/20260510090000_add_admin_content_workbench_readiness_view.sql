CREATE OR REPLACE VIEW public.admin_content_workbench_readiness AS
WITH segment_counts AS (
    SELECT
        s.item_id AS content_item_id,
        COUNT(*)::integer AS total_segments
    FROM public.segment s
    WHERE s.deleted_at IS NULL
      AND btrim(COALESCE(s.markdown_body, '')) <> ''
    GROUP BY s.item_id
),
embedded_segment_counts AS (
    SELECT
        s.item_id AS content_item_id,
        COUNT(DISTINCT seg.segment_id)::integer AS embedded_segments
    FROM public.segment s
    INNER JOIN public.segment_embedding_gemini seg
      ON seg.segment_id = s.id
     AND seg.content_item_id = s.item_id
    WHERE s.deleted_at IS NULL
      AND btrim(COALESCE(s.markdown_body, '')) <> ''
    GROUP BY s.item_id
)
SELECT
    ci.id,
    ci.title,
    ci.type,
    ci.author,
    ci.category,
    ci.status,
    ci.is_featured,
    ci.audio_url,
    ci.narration_status,
    ci.narration_error,
    ci.narration_requested_at,
    ci.narration_started_at,
    ci.narration_completed_at,
    ci.created_at,
    ci.updated_at,
    ci.deleted_at,
    ci.embedding,
    (ci.embedding IS NOT NULL) AS has_content_embedding,
    COALESCE(sc.total_segments, 0)::integer AS total_segments,
    LEAST(
        COALESCE(esc.embedded_segments, 0),
        COALESCE(sc.total_segments, 0)
    )::integer AS embedded_segments,
    GREATEST(
        COALESCE(sc.total_segments, 0) - COALESCE(esc.embedded_segments, 0),
        0
    )::integer AS missing_segments,
    CASE
        WHEN ci.status <> 'verified' THEN 'not_applicable'
        WHEN ci.embedding IS NULL THEN 'stale'
        WHEN COALESCE(sc.total_segments, 0) = 0 THEN 'stale'
        WHEN COALESCE(esc.embedded_segments, 0) < COALESCE(sc.total_segments, 0) THEN 'stale'
        ELSE 'ready'
    END AS ai_status
FROM public.content_item ci
LEFT JOIN segment_counts sc
  ON sc.content_item_id = ci.id
LEFT JOIN embedded_segment_counts esc
  ON esc.content_item_id = ci.id;

REVOKE SELECT ON public.admin_content_workbench_readiness
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_content_workbench_readiness
TO service_role;
