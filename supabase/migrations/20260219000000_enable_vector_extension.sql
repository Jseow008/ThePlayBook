-- Reconciliation-only prerequisite for migrations that reference extensions.vector.
-- Production already has vector enabled in the extensions schema.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.content_item
ADD COLUMN IF NOT EXISTS embedding extensions.vector(768);

CREATE INDEX IF NOT EXISTS content_item_embedding_idx
ON public.content_item USING hnsw (embedding extensions.vector_cosine_ops);
