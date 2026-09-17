-- Complete exports may be resumed only by the same verified Supabase Auth
-- session that created them. The snapshot schema stays private and remains
-- inaccessible through the Data API.
ALTER TABLE snapshot_private.account_data_snapshots
    ADD COLUMN IF NOT EXISTS resume_session_id uuid;

CREATE INDEX IF NOT EXISTS idx_account_data_snapshots_resume_session
    ON snapshot_private.account_data_snapshots (account_id, resume_session_id, expires_at DESC)
    WHERE resume_session_id IS NOT NULL;
