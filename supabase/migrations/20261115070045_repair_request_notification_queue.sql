-- Preserve the outbox contract; DISTINCT must compare an enum, not inferred text.
CREATE OR REPLACE FUNCTION public.queue_content_request_published_notifications(p_request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'queue_content_request_published_notifications requires service role';
  END IF;

  INSERT INTO public.user_notification_preferences (user_id)
  SELECT DISTINCT crv.user_id
  FROM public.content_request_votes crv
  INNER JOIN public.profiles p ON p.id = crv.user_id
  WHERE crv.request_id = p_request_id
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.content_request_notifications (request_id, user_id, type)
  SELECT DISTINCT p_request_id, crv.user_id, 'published'::public.content_request_notification_type
  FROM public.content_request_votes crv
  INNER JOIN public.profiles p ON p.id = crv.user_id
  WHERE crv.request_id = p_request_id
  ON CONFLICT (request_id, user_id, type) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;


REVOKE ALL ON FUNCTION public.queue_content_request_published_notifications(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_content_request_published_notifications(uuid) TO service_role;

-- Read-only health metric: missing enqueue is invisible to queue-status counts.
CREATE FUNCTION public.count_missing_content_request_notifications()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT count(*)
  FROM public.content_request_votes AS interest
  JOIN public.content_requests AS request ON request.id = interest.request_id
  JOIN public.profiles AS profile ON profile.id = interest.user_id
  LEFT JOIN public.user_notification_preferences AS preference ON preference.user_id = interest.user_id
  WHERE request.status = 'published'
    AND request.published_content_id IS NOT NULL
    AND profile.email IS NOT NULL AND btrim(profile.email) <> ''
    AND coalesce(preference.request_published_email_enabled, true)
    AND NOT EXISTS (
      SELECT 1 FROM public.content_request_notifications AS notification
      WHERE notification.request_id = request.id
        AND notification.user_id = interest.user_id
        AND notification.type = 'published'::public.content_request_notification_type
    );
$$;
REVOKE ALL ON FUNCTION public.count_missing_content_request_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_missing_content_request_notifications() TO service_role;
