-- Content request published notifications
-- Adds a transactional notification outbox and per-user opt-out preferences.

DO $$
BEGIN
  CREATE TYPE public.content_request_notification_type AS ENUM ('published');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.content_request_notification_status AS ENUM (
    'queued',
    'processing',
    'sent',
    'failed',
    'skipped'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_published_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  unsubscribe_token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_notification_preferences_unsubscribe_token_unique UNIQUE (unsubscribe_token),
  CONSTRAINT user_notification_preferences_unsubscribe_token_length CHECK (char_length(unsubscribe_token) >= 32)
);

CREATE TABLE IF NOT EXISTS public.content_request_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  user_id UUID NOT NULL,
  type public.content_request_notification_type NOT NULL DEFAULT 'published',
  status public.content_request_notification_status NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id TEXT,
  last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT content_request_notifications_request_id_fkey
    FOREIGN KEY (request_id) REFERENCES public.content_requests(id) ON DELETE CASCADE,
  CONSTRAINT content_request_notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT content_request_notifications_unique_recipient
    UNIQUE (request_id, user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_content_request_notifications_status_queue
  ON public.content_request_notifications (status, queued_at)
  WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS idx_content_request_notifications_request_id
  ON public.content_request_notifications (request_id);

DROP TRIGGER IF EXISTS update_user_notification_preferences_updated_at ON public.user_notification_preferences;
CREATE TRIGGER update_user_notification_preferences_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_content_request_notifications_updated_at ON public.content_request_notifications;
CREATE TRIGGER update_content_request_notifications_updated_at
  BEFORE UPDATE ON public.content_request_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_request_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can view own notification preferences"
  ON public.user_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can insert own notification preferences"
  ON public.user_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can update own notification preferences"
  ON public.user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role has full access to notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Service role has full access to notification preferences"
  ON public.user_notification_preferences FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role has full access to content request notifications" ON public.content_request_notifications;
CREATE POLICY "Service role has full access to content request notifications"
  ON public.content_request_notifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

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
  SELECT DISTINCT p_request_id, crv.user_id, 'published'
  FROM public.content_request_votes crv
  INNER JOIN public.profiles p ON p.id = crv.user_id
  WHERE crv.request_id = p_request_id
  ON CONFLICT (request_id, user_id, type) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_content_request_notifications(p_limit INTEGER DEFAULT 20)
RETURNS SETOF public.content_request_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'claim_content_request_notifications requires service role';
  END IF;

  RETURN QUERY
  UPDATE public.content_request_notifications
  SET
    status = 'processing',
    processing_started_at = NOW(),
    updated_at = NOW()
  WHERE id IN (
    SELECT id
    FROM public.content_request_notifications
    WHERE status = 'queued'
      AND attempts < 3
    ORDER BY queued_at ASC
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_content_request_published_notifications(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_content_request_published_notifications(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.claim_content_request_notifications(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_content_request_notifications(INTEGER) TO service_role;
