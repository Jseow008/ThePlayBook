-- Avoid PL/pgSQL name ambiguity between the returned request_id column
-- and the content_request_votes.request_id conflict target.

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
        'requested'
      )
      RETURNING id INTO target_request_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id
      INTO target_request_id
      FROM public.content_requests
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
