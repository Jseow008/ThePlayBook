-- Phase 1 #10: complete, export-safe account-data snapshots.
--
-- The snapshot tables remain in the private `snapshot_private` schema. This
-- migration grants the restricted snapshot worker only the source reads it
-- needs, and each policy repeats the transaction-local account binding.

ALTER TABLE snapshot_private.account_data_snapshots
    ADD COLUMN IF NOT EXISTS collection_manifests jsonb NOT NULL DEFAULT '{}'::jsonb;

GRANT SELECT ON public.profiles,
                public.user_highlights,
                public.user_reflections,
                public.reading_activity,
                public.content_feedback,
                public.content_requests,
                public.content_request_votes,
                public.user_notification_preferences,
                public.content_request_notifications,
                public.ai_message_usage
    TO netflux_snapshot_worker;

DROP POLICY IF EXISTS "Snapshot worker reads scoped profiles" ON public.profiles;
CREATE POLICY "Snapshot worker reads scoped profiles"
    ON public.profiles FOR SELECT
    TO netflux_snapshot_worker
    USING (id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

DROP POLICY IF EXISTS "Snapshot worker reads scoped highlights" ON public.user_highlights;
CREATE POLICY "Snapshot worker reads scoped highlights"
    ON public.user_highlights FOR SELECT
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

DROP POLICY IF EXISTS "Snapshot worker reads scoped reflections" ON public.user_reflections;
CREATE POLICY "Snapshot worker reads scoped reflections"
    ON public.user_reflections FOR SELECT
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

DROP POLICY IF EXISTS "Snapshot worker reads scoped reading activity" ON public.reading_activity;
CREATE POLICY "Snapshot worker reads scoped reading activity"
    ON public.reading_activity FOR SELECT
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

DROP POLICY IF EXISTS "Snapshot worker reads scoped feedback" ON public.content_feedback;
CREATE POLICY "Snapshot worker reads scoped feedback"
    ON public.content_feedback FOR SELECT
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

-- A submitted request may no longer be public (for example, it is hidden or
-- archived), but its submitter can still export their own user-visible record.
DROP POLICY IF EXISTS "Snapshot worker reads scoped submitted requests" ON public.content_requests;
CREATE POLICY "Snapshot worker reads scoped submitted requests"
    ON public.content_requests FOR SELECT
    TO netflux_snapshot_worker
    USING (submitted_by = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

DROP POLICY IF EXISTS "Snapshot worker reads scoped request votes" ON public.content_request_votes;
CREATE POLICY "Snapshot worker reads scoped request votes"
    ON public.content_request_votes FOR SELECT
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

DROP POLICY IF EXISTS "Snapshot worker reads scoped notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Snapshot worker reads scoped notification preferences"
    ON public.user_notification_preferences FOR SELECT
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

DROP POLICY IF EXISTS "Snapshot worker reads scoped request notifications" ON public.content_request_notifications;
CREATE POLICY "Snapshot worker reads scoped request notifications"
    ON public.content_request_notifications FOR SELECT
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

DROP POLICY IF EXISTS "Snapshot worker reads scoped AI usage" ON public.ai_message_usage;
CREATE POLICY "Snapshot worker reads scoped AI usage"
    ON public.ai_message_usage FOR SELECT
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);
