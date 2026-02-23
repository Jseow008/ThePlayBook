-- Create user_highlights table
CREATE TABLE user_highlights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_item_id UUID NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
    segment_id UUID REFERENCES segment(id) ON DELETE CASCADE,
    highlighted_text TEXT NOT NULL,
    note_body TEXT,
    color VARCHAR(50) DEFAULT 'yellow',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices for user_highlights
CREATE INDEX idx_user_highlights_user_content ON user_highlights(user_id, content_item_id);
CREATE INDEX idx_user_highlights_user ON user_highlights(user_id);

-- RLS for user_highlights
ALTER TABLE user_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own highlights" ON user_highlights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own highlights" ON user_highlights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own highlights" ON user_highlights FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own highlights" ON user_highlights FOR DELETE USING (auth.uid() = user_id);

-- Create segment_embedding table for RAG
CREATE TABLE segment_embedding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES segment(id) ON DELETE CASCADE,
    content_item_id UUID NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for segment_embedding
CREATE INDEX ON segment_embedding USING hnsw (embedding vector_ip_ops);

-- RLS for segment_embedding
ALTER TABLE segment_embedding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON segment_embedding FOR SELECT USING (true);

-- RPC for Ask My Library feature
CREATE OR REPLACE FUNCTION match_library_segments (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  segment_id uuid,
  content_item_id uuid,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    se.segment_id,
    se.content_item_id,
    1 - (se.embedding <=> query_embedding) AS similarity
  FROM segment_embedding se
  INNER JOIN user_library ul ON ul.content_id = se.content_item_id
  WHERE ul.user_id = p_user_id AND 1 - (se.embedding <=> query_embedding) > match_threshold
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
$$;
