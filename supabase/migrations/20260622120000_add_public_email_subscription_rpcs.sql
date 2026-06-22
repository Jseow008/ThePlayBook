-- Replace service-role usage in public email routes with narrow public RPCs.
-- Table access stays protected by RLS; these functions validate inputs and only
-- perform the intended subscription or token-scoped unsubscribe mutation.

CREATE OR REPLACE FUNCTION public.subscribe_email_subscription(
  p_email TEXT,
  p_source TEXT,
  p_page_path TEXT,
  p_referrer TEXT,
  p_user_agent TEXT,
  p_consent_text TEXT,
  p_consent_version TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := btrim(COALESCE(p_email, ''));
  v_email_normalized TEXT := lower(btrim(COALESCE(p_email, '')));
  v_source TEXT := btrim(COALESCE(p_source, ''));
  v_page_path TEXT := NULLIF(btrim(COALESCE(p_page_path, '')), '');
  v_referrer TEXT := NULLIF(btrim(COALESCE(p_referrer, '')), '');
  v_user_agent TEXT := NULLIF(left(btrim(COALESCE(p_user_agent, '')), 512), '');
  v_consent_text TEXT := btrim(COALESCE(p_consent_text, ''));
  v_consent_version TEXT := btrim(COALESCE(p_consent_version, ''));
BEGIN
  IF char_length(v_email_normalized) NOT BETWEEN 3 AND 254
    OR v_email_normalized !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  THEN
    RAISE EXCEPTION 'invalid email subscription email' USING ERRCODE = '22023';
  END IF;

  IF v_source <> 'landing_final_cta' THEN
    RAISE EXCEPTION 'invalid email subscription source' USING ERRCODE = '22023';
  END IF;

  IF v_page_path IS NOT NULL AND char_length(v_page_path) > 256 THEN
    RAISE EXCEPTION 'invalid email subscription page path' USING ERRCODE = '22023';
  END IF;

  IF v_referrer IS NOT NULL AND char_length(v_referrer) > 512 THEN
    RAISE EXCEPTION 'invalid email subscription referrer' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_consent_text) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid email subscription consent text' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_consent_version) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid email subscription consent version' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.email_subscription (
    email,
    source,
    page_path,
    referrer,
    user_agent,
    consent_text,
    consent_version,
    status,
    unsubscribed_at
  )
  VALUES (
    v_email,
    v_source,
    v_page_path,
    v_referrer,
    v_user_agent,
    v_consent_text,
    v_consent_version,
    'subscribed',
    NULL
  )
  ON CONFLICT (email_normalized) DO UPDATE SET
    email = EXCLUDED.email,
    source = EXCLUDED.source,
    page_path = EXCLUDED.page_path,
    referrer = EXCLUDED.referrer,
    user_agent = EXCLUDED.user_agent,
    consent_text = EXCLUDED.consent_text,
    consent_version = EXCLUDED.consent_version,
    status = 'subscribed',
    subscribed_at = NOW(),
    unsubscribed_at = NULL,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.unsubscribe_email_subscription_by_token(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT := lower(btrim(COALESCE(p_token, '')));
BEGIN
  IF char_length(v_token) NOT BETWEEN 32 AND 128 OR v_token !~ '^[a-f0-9]+$' THEN
    RAISE EXCEPTION 'invalid email subscription token' USING ERRCODE = '22023';
  END IF;

  UPDATE public.email_subscription
  SET
    status = 'unsubscribed',
    unsubscribed_at = NOW(),
    updated_at = NOW()
  WHERE unsubscribe_token = v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.unsubscribe_request_published_notifications_by_token(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT := lower(btrim(COALESCE(p_token, '')));
BEGIN
  IF char_length(v_token) NOT BETWEEN 32 AND 128 OR v_token !~ '^[a-f0-9]+$' THEN
    RAISE EXCEPTION 'invalid request notification token' USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_notification_preferences
  SET
    request_published_email_enabled = FALSE,
    updated_at = NOW()
  WHERE unsubscribe_token = v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_email_subscription(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_email_subscription(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.unsubscribe_email_subscription_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_email_subscription_by_token(TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.unsubscribe_request_published_notifications_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_request_published_notifications_by_token(TEXT) TO anon, authenticated, service_role;
