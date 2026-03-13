-- Parallel Gemini-based segment embeddings for Ask My Library retrieval.
-- Keeps the existing OpenAI 1536-dim path intact during migration.

CREATE TABLE public.segment_embedding_gemini (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES public.segment(id) ON DELETE CASCADE,
    content_item_id UUID NOT NULL REFERENCES public.content_item(id) ON DELETE CASCADE,
    embedding vector(768) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX segment_embedding_gemini_segment_id_key
    ON public.segment_embedding_gemini (segment_id);

CREATE INDEX segment_embedding_gemini_embedding_idx
    ON public.segment_embedding_gemini
    USING hnsw (embedding vector_ip_ops);

ALTER TABLE public.segment_embedding_gemini ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users on Gemini segment embeddings"
    ON public.segment_embedding_gemini
    FOR SELECT
    USING (true);

CREATE OR REPLACE FUNCTION public.get_segments_missing_gemini_embeddings(p_limit integer DEFAULT 50)
RETURNS TABLE(
    id uuid,
    content_item_id uuid,
    markdown_body text
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        s.id,
        s.item_id AS content_item_id,
        s.markdown_body
    FROM public.segment s
    LEFT JOIN public.segment_embedding_gemini seg
      ON seg.segment_id = s.id
    INNER JOIN public.content_item ci
      ON ci.id = s.item_id
    WHERE seg.segment_id IS NULL
      AND ci.deleted_at IS NULL
      AND ci.status = 'verified'
    ORDER BY s.created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

CREATE OR REPLACE FUNCTION public.match_library_segments_gemini(
    query_embedding vector(768),
    match_threshold double precision,
    match_count integer,
    p_user_id uuid
)
RETURNS TABLE(
    segment_id uuid,
    content_item_id uuid,
    similarity double precision
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        seg.segment_id,
        seg.content_item_id,
        1 - (seg.embedding <=> query_embedding) AS similarity
    FROM public.segment_embedding_gemini seg
    INNER JOIN public.user_library ul ON ul.content_id = seg.content_item_id
    WHERE ul.user_id = p_user_id
      AND 1 - (seg.embedding <=> query_embedding) > match_threshold
    ORDER BY seg.embedding <=> query_embedding
    LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.get_segments_missing_gemini_embeddings(integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_segments_missing_gemini_embeddings(integer)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.match_library_segments_gemini(vector(768), double precision, integer, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_library_segments_gemini(vector(768), double precision, integer, uuid)
TO authenticated, service_role;
