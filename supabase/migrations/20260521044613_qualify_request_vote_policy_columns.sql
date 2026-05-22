-- Qualify content request vote policy columns so submit_content_request()
-- does not conflict with its returned request_id column name.

DROP POLICY IF EXISTS "Users can view own request votes" ON public.content_request_votes;
CREATE POLICY "Users can view own request votes"
  ON public.content_request_votes FOR SELECT
  USING (auth.uid() = content_request_votes.user_id);

DROP POLICY IF EXISTS "Users can vote on visible requests" ON public.content_request_votes;
CREATE POLICY "Users can vote on visible requests"
  ON public.content_request_votes FOR INSERT
  WITH CHECK (
    auth.uid() = content_request_votes.user_id
    AND EXISTS (
      SELECT 1
      FROM public.content_requests
      WHERE content_requests.id = content_request_votes.request_id
        AND content_requests.hidden_at IS NULL
        AND content_requests.status <> 'archived'
    )
  );

DROP POLICY IF EXISTS "Users can remove own request votes" ON public.content_request_votes;
CREATE POLICY "Users can remove own request votes"
  ON public.content_request_votes FOR DELETE
  USING (auth.uid() = content_request_votes.user_id);
