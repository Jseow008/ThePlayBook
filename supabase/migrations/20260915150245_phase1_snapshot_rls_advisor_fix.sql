-- Supabase's RLS advisor recognizes a directly selected current_setting()
-- expression as an initplan. With missing_ok enabled, an unset binding is NULL,
-- so every predicate remains fail-closed.

ALTER POLICY "Snapshot worker accesses scoped operations"
    ON snapshot_private.account_data_snapshot_operations
    USING (account_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid))
    WITH CHECK (account_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker accesses scoped snapshots"
    ON snapshot_private.account_data_snapshots
    USING (account_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid))
    WITH CHECK (account_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker accesses scoped records"
    ON snapshot_private.account_data_snapshot_records
    USING (EXISTS (
        SELECT 1 FROM snapshot_private.account_data_snapshots snapshot
        WHERE snapshot.id = snapshot_id
          AND snapshot.account_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM snapshot_private.account_data_snapshots snapshot
        WHERE snapshot.id = snapshot_id
          AND snapshot.account_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid)
    ));

ALTER POLICY "Snapshot worker reads scoped library"
    ON public.user_library
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker resets scoped library"
    ON public.user_library
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker writes scoped library"
    ON public.user_library
    WITH CHECK (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker updates scoped library"
    ON public.user_library
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid))
    WITH CHECK (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped library state"
    ON public.account_library_state
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker writes scoped library state"
    ON public.account_library_state
    WITH CHECK (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker updates scoped library state"
    ON public.account_library_state
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid))
    WITH CHECK (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped profiles"
    ON public.profiles
    USING (id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped highlights"
    ON public.user_highlights
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped reflections"
    ON public.user_reflections
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped reading activity"
    ON public.reading_activity
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped feedback"
    ON public.content_feedback
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped submitted requests"
    ON public.content_requests
    USING (submitted_by = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped request votes"
    ON public.content_request_votes
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped notification preferences"
    ON public.user_notification_preferences
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped request notifications"
    ON public.content_request_notifications
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));

ALTER POLICY "Snapshot worker reads scoped AI usage"
    ON public.ai_message_usage
    USING (user_id = (SELECT current_setting('app.snapshot_account_id', true)::uuid));
