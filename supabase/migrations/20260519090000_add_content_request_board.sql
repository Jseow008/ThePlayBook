-- Community Request Board
-- Adds public content requests, one-vote-per-user voting, and admin-managed status.

DO $$
BEGIN
  CREATE TYPE content_request_status AS ENUM (
    'requested',
    'under_review',
    'in_progress',
    'published',
    'source_unavailable',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS content_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0 AND char_length(title) <= 300),
  author TEXT CHECK (author IS NULL OR char_length(author) <= 180),
  source_url TEXT CHECK (source_url IS NULL OR char_length(source_url) <= 1000),
  normalized_url TEXT CHECK (normalized_url IS NULL OR char_length(normalized_url) <= 1000),
  normalized_title TEXT NOT NULL CHECK (char_length(normalized_title) > 0 AND char_length(normalized_title) <= 300),
  normalized_author TEXT CHECK (normalized_author IS NULL OR char_length(normalized_author) <= 180),
  content_type content_type NOT NULL DEFAULT 'book',
  thumbnail_url TEXT CHECK (thumbnail_url IS NULL OR char_length(thumbnail_url) <= 1000),
  status content_request_status NOT NULL DEFAULT 'requested',
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_content_id UUID REFERENCES content_item(id) ON DELETE SET NULL,
  vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  hidden_at TIMESTAMPTZ,
  hidden_reason TEXT CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_request_votes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES content_requests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, request_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_requests_normalized_url_unique
  ON content_requests (normalized_url)
  WHERE normalized_url IS NOT NULL AND hidden_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_requests_normalized_text_unique
  ON content_requests (content_type, normalized_title, COALESCE(normalized_author, ''))
  WHERE normalized_url IS NULL AND hidden_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_requests_board_order
  ON content_requests (status, vote_count DESC, created_at DESC)
  WHERE hidden_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_request_votes_request_id
  ON content_request_votes (request_id);

DROP TRIGGER IF EXISTS update_content_requests_updated_at ON content_requests;
CREATE TRIGGER update_content_requests_updated_at
  BEFORE UPDATE ON content_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_content_request_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE content_requests
    SET vote_count = vote_count + 1
    WHERE id = NEW.request_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE content_requests
    SET vote_count = GREATEST(vote_count - 1, 0)
    WHERE id = OLD.request_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_request_vote_count_insert ON content_request_votes;
CREATE TRIGGER content_request_vote_count_insert
  AFTER INSERT ON content_request_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_content_request_vote_count();

DROP TRIGGER IF EXISTS content_request_vote_count_delete ON content_request_votes;
CREATE TRIGGER content_request_vote_count_delete
  AFTER DELETE ON content_request_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_content_request_vote_count();

ALTER TABLE content_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_request_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view visible content requests" ON content_requests;
CREATE POLICY "Anyone can view visible content requests"
  ON content_requests FOR SELECT
  USING (hidden_at IS NULL AND status <> 'archived');

DROP POLICY IF EXISTS "Service role has full access to content requests" ON content_requests;
CREATE POLICY "Service role has full access to content requests"
  ON content_requests FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own request votes" ON content_request_votes;
CREATE POLICY "Users can view own request votes"
  ON content_request_votes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can vote on visible requests" ON content_request_votes;
CREATE POLICY "Users can vote on visible requests"
  ON content_request_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM content_requests
      WHERE content_requests.id = request_id
        AND content_requests.hidden_at IS NULL
        AND content_requests.status <> 'archived'
    )
  );

DROP POLICY IF EXISTS "Users can remove own request votes" ON content_request_votes;
CREATE POLICY "Users can remove own request votes"
  ON content_request_votes FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role has full access to request votes" ON content_request_votes;
CREATE POLICY "Service role has full access to request votes"
  ON content_request_votes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP FUNCTION IF EXISTS submit_content_request(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  content_type,
  TEXT
);

CREATE OR REPLACE FUNCTION submit_content_request(
  p_user_id UUID,
  p_title TEXT,
  p_author TEXT,
  p_source_url TEXT,
  p_normalized_url TEXT,
  p_normalized_title TEXT,
  p_normalized_author TEXT,
  p_content_type content_type,
  p_thumbnail_url TEXT
)
RETURNS TABLE (
  request_id UUID,
  duplicate BOOLEAN,
  voted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_request_id UUID;
  target_request_id UUID;
  was_duplicate BOOLEAN := FALSE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'submit_content_request requires service role';
  END IF;

  SELECT id
  INTO existing_request_id
  FROM content_requests
  WHERE hidden_at IS NULL
    AND status <> 'archived'
    AND (
      (p_normalized_url IS NOT NULL AND normalized_url = p_normalized_url)
      OR (
        p_normalized_url IS NULL
        AND normalized_url IS NULL
        AND content_type = p_content_type
        AND normalized_title = p_normalized_title
        AND COALESCE(normalized_author, '') = COALESCE(p_normalized_author, '')
      )
    )
  ORDER BY created_at ASC
  LIMIT 1;

  IF existing_request_id IS NULL THEN
    BEGIN
      INSERT INTO content_requests (
        title,
        author,
        source_url,
        normalized_url,
        normalized_title,
        normalized_author,
        content_type,
        thumbnail_url,
        submitted_by,
        status
      )
      VALUES (
        p_title,
        p_author,
        p_source_url,
        p_normalized_url,
        p_normalized_title,
        p_normalized_author,
        p_content_type,
        p_thumbnail_url,
        p_user_id,
        'requested'
      )
      RETURNING id INTO target_request_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id
      INTO target_request_id
      FROM content_requests
      WHERE hidden_at IS NULL
        AND status <> 'archived'
        AND (
          (p_normalized_url IS NOT NULL AND normalized_url = p_normalized_url)
          OR (
            p_normalized_url IS NULL
            AND normalized_url IS NULL
            AND content_type = p_content_type
            AND normalized_title = p_normalized_title
            AND COALESCE(normalized_author, '') = COALESCE(p_normalized_author, '')
          )
        )
      ORDER BY created_at ASC
      LIMIT 1;

      IF target_request_id IS NULL THEN
        RAISE;
      END IF;

      was_duplicate := TRUE;
    END;
  ELSE
    target_request_id := existing_request_id;
    was_duplicate := TRUE;
  END IF;

  INSERT INTO content_request_votes (user_id, request_id)
  VALUES (p_user_id, target_request_id)
  ON CONFLICT (user_id, request_id) DO NOTHING;

  RETURN QUERY SELECT target_request_id, was_duplicate, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION submit_content_request(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  content_type,
  TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION submit_content_request(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  content_type,
  TEXT
) TO service_role;
