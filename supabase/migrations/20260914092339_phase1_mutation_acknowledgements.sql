-- Phase 1 #7 follow-up: mutation acknowledgements are issued by the
-- restricted server worker, not a browser-exposed RPC. The worker writes an
-- item and reads account_library_state in one transaction, returning the
-- trigger-produced revision and reset epoch through the authenticated route.
-- This preserves the exact boundary without making an extra Data API surface.
GRANT INSERT, UPDATE ON public.user_library TO netflux_snapshot_worker;

CREATE POLICY "Snapshot worker writes scoped library"
    ON public.user_library FOR INSERT
    TO netflux_snapshot_worker
    WITH CHECK (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

CREATE POLICY "Snapshot worker updates scoped library"
    ON public.user_library FOR UPDATE
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid)
    WITH CHECK (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);
