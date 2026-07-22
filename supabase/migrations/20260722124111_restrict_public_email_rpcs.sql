-- DB-106: keep public email flows behind the application rate-limit and
-- security-telemetry boundary. The application server invokes these narrow
-- SECURITY DEFINER functions with the service role; browser-facing Supabase
-- roles must not call them directly through the Data API.

REVOKE EXECUTE ON FUNCTION public.subscribe_email_subscription(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_email_subscription(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.unsubscribe_email_subscription_by_token(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_email_subscription_by_token(TEXT)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.unsubscribe_request_published_notifications_by_token(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_request_published_notifications_by_token(TEXT)
  TO service_role;
