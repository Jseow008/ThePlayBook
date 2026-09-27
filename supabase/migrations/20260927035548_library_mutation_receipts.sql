-- Private, account-bound immutable acknowledgements. Retain until reset/deletion.
CREATE TABLE snapshot_private.library_mutation_receipts (
    account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reset_epoch bigint NOT NULL CHECK (reset_epoch >= 0),
    mutation_id uuid NOT NULL,
    request_fingerprint text NOT NULL CHECK (length(request_fingerprint) = 64),
    acknowledgement jsonb NOT NULL CHECK (octet_length(acknowledgement::text) <= 2048),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, reset_epoch, mutation_id)
);
CREATE TABLE snapshot_private.library_guest_import_receipts (
    account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reset_epoch bigint NOT NULL CHECK (reset_epoch >= 0),
    guest_storage_id uuid NOT NULL,
    source_record_id uuid NOT NULL,
    migration_id uuid NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('applied', 'skipped')),
    reason text CHECK (reason = 'destination_exists'),
    PRIMARY KEY (account_id, reset_epoch, guest_storage_id, source_record_id)
);
ALTER TABLE snapshot_private.library_mutation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot_private.library_guest_import_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snapshot_private.library_mutation_receipts, snapshot_private.library_guest_import_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON snapshot_private.library_mutation_receipts, snapshot_private.library_guest_import_receipts TO netflux_snapshot_worker;
CREATE POLICY library_mutation_receipts_worker ON snapshot_private.library_mutation_receipts
    FOR ALL TO netflux_snapshot_worker
    USING (account_id = ((SELECT current_setting('app.snapshot_account_id', true))::uuid))
    WITH CHECK (account_id = ((SELECT current_setting('app.snapshot_account_id', true))::uuid));
CREATE POLICY library_guest_import_receipts_worker ON snapshot_private.library_guest_import_receipts
    FOR ALL TO netflux_snapshot_worker
    USING (account_id = ((SELECT current_setting('app.snapshot_account_id', true))::uuid))
    WITH CHECK (account_id = ((SELECT current_setting('app.snapshot_account_id', true))::uuid));
