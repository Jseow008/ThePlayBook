-- Simplify request lifecycle statuses for script/admin processing.
-- New lifecycle:
-- pending -> processing -> published, with skipped/failed as terminal outcomes.

UPDATE public.content_requests
SET admin_note = COALESCE(
    NULLIF(btrim(admin_note), ''),
    NULLIF(btrim(source_availability_note), ''),
    CASE
      WHEN status::text = 'source_unavailable' THEN 'Skipped because the source was unavailable before status simplification.'
      WHEN status::text = 'archived' THEN 'Skipped because the request was archived before status simplification.'
      ELSE NULL
    END
  )
WHERE status::text IN ('source_unavailable', 'archived');

DROP POLICY IF EXISTS "Anyone can view visible content requests" ON public.content_requests;
DROP POLICY IF EXISTS "Users can vote on visible requests" ON public.content_request_votes;
DROP INDEX IF EXISTS public.idx_content_requests_board_order;
DROP INDEX IF EXISTS public.idx_content_requests_normalized_url_unique;
DROP INDEX IF EXISTS public.idx_content_requests_normalized_text_unique;

DO $$
BEGIN
  CREATE TYPE public.content_request_status_new AS ENUM (
    'pending',
    'processing',
    'published',
    'skipped',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE public.content_requests
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.content_requests
  ALTER COLUMN status TYPE public.content_request_status_new
  USING (
    CASE status::text
      WHEN 'requested' THEN 'pending'
      WHEN 'under_review' THEN 'processing'
      WHEN 'in_progress' THEN 'processing'
      WHEN 'published' THEN 'published'
      WHEN 'source_unavailable' THEN 'skipped'
      WHEN 'archived' THEN 'skipped'
      WHEN 'pending' THEN 'pending'
      WHEN 'processing' THEN 'processing'
      WHEN 'skipped' THEN 'skipped'
      WHEN 'failed' THEN 'failed'
      ELSE 'pending'
    END
  )::public.content_request_status_new;

ALTER TABLE public.content_requests
  ALTER COLUMN status SET DEFAULT 'pending';

DROP TYPE IF EXISTS public.content_request_status;
ALTER TYPE public.content_request_status_new RENAME TO content_request_status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_requests_normalized_url_unique
  ON public.content_requests (normalized_url)
  WHERE normalized_url IS NOT NULL
    AND hidden_at IS NULL
    AND status IN ('pending', 'processing', 'published');

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_requests_normalized_text_unique
  ON public.content_requests (content_type, normalized_title, COALESCE(normalized_author, ''))
  WHERE normalized_url IS NULL
    AND hidden_at IS NULL
    AND status IN ('pending', 'processing', 'published');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_requests_terminal_admin_note_required'
      AND conrelid = 'public.content_requests'::regclass
  ) THEN
    ALTER TABLE public.content_requests
      ADD CONSTRAINT content_requests_terminal_admin_note_required
      CHECK (
        status NOT IN ('skipped', 'failed')
        OR admin_note IS NOT NULL
        AND char_length(btrim(admin_note)) > 0
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_content_requests_board_order
  ON public.content_requests (status, vote_count DESC, created_at DESC)
  WHERE hidden_at IS NULL AND status IN ('pending', 'processing', 'published');

CREATE POLICY "Anyone can view visible content requests"
  ON public.content_requests FOR SELECT
  USING (hidden_at IS NULL AND status IN ('pending', 'processing', 'published'));

CREATE POLICY "Users can vote on visible requests"
  ON public.content_request_votes FOR INSERT
  WITH CHECK (
    auth.uid() = content_request_votes.user_id
    AND EXISTS (
      SELECT 1
      FROM public.content_requests
      WHERE content_requests.id = content_request_votes.request_id
        AND content_requests.hidden_at IS NULL
        AND content_requests.status IN ('pending', 'processing')
    )
  );

CREATE OR REPLACE FUNCTION public.submit_content_request(
  p_user_id UUID,
  p_title TEXT,
  p_author TEXT,
  p_source_url TEXT,
  p_normalized_url TEXT,
  p_normalized_title TEXT,
  p_normalized_author TEXT,
  p_content_type public.content_type,
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
  FROM public.content_requests
  WHERE hidden_at IS NULL
    AND status IN ('pending', 'processing', 'published')
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
      INSERT INTO public.content_requests (
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
        'pending'
      )
      RETURNING id INTO target_request_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id
      INTO target_request_id
      FROM public.content_requests
      WHERE hidden_at IS NULL
        AND status IN ('pending', 'processing', 'published')
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

  INSERT INTO public.content_request_votes (user_id, request_id)
  VALUES (p_user_id, target_request_id)
  ON CONFLICT ON CONSTRAINT content_request_votes_pkey DO NOTHING;

  RETURN QUERY SELECT target_request_id, was_duplicate, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_content_request(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  public.content_type,
  TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_content_request(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  public.content_type,
  TEXT
) TO service_role;
