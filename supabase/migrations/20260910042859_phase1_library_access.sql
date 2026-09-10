-- Phase 1 #7: deterministic library access and server-owned snapshot state.
-- Snapshot payload tables are intentionally private and are never exposed through
-- the Data API. The web server reaches them only through a direct DB connection.

-- Snapshot copies are isolated from the existing `private` schema. That
-- schema already contains authenticated vector-search helpers, so revoking
-- its schema usage would break retrieval.
CREATE SCHEMA IF NOT EXISTS snapshot_private;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
    CREATE ROLE netflux_snapshot_worker NOLOGIN NOINHERIT NOBYPASSRLS;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

-- Cleanup has a separate no-login role. It is the only deliberately
-- cross-account snapshot actor, used by the authenticated server scheduler;
-- request workers remain account-bound by RLS.
DO $$
BEGIN
    CREATE ROLE netflux_snapshot_maintenance NOLOGIN NOINHERIT NOBYPASSRLS;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE public.user_library
    ADD COLUMN IF NOT EXISTS library_updated_at timestamptz,
    ADD COLUMN IF NOT EXISTS library_revision bigint NOT NULL DEFAULT 0;

UPDATE public.user_library
SET library_updated_at = COALESCE(last_interacted_at, now())
WHERE library_updated_at IS NULL;

ALTER TABLE public.user_library
    ALTER COLUMN library_updated_at SET NOT NULL,
    ALTER COLUMN library_updated_at SET DEFAULT now();

CREATE TABLE IF NOT EXISTS public.account_library_state (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    reset_epoch bigint NOT NULL DEFAULT 0 CHECK (reset_epoch >= 0),
    current_revision bigint NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.account_library_state (user_id, current_revision)
SELECT user_id, COALESCE(MAX(library_revision), 0)
FROM public.user_library
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE
SET current_revision = GREATEST(
    public.account_library_state.current_revision,
    EXCLUDED.current_revision
);

ALTER TABLE public.account_library_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own library state" ON public.account_library_state;
CREATE POLICY "Users can view their own library state"
    ON public.account_library_state FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- This trigger function is private because ordinary API clients must not be
-- able to invoke a privileged revision bump directly. The trigger itself is
-- the only caller.
CREATE OR REPLACE FUNCTION private.assign_user_library_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    next_revision bigint;
BEGIN
    INSERT INTO public.account_library_state (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.account_library_state
    SET current_revision = current_revision + 1,
        updated_at = now()
    WHERE user_id = NEW.user_id
    RETURNING current_revision INTO next_revision;

    NEW.library_revision := next_revision;
    NEW.library_updated_at := now();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.assign_user_library_revision() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assign_user_library_revision ON public.user_library;
CREATE TRIGGER assign_user_library_revision
    BEFORE INSERT OR UPDATE ON public.user_library
    FOR EACH ROW
    EXECUTE FUNCTION private.assign_user_library_revision();

CREATE OR REPLACE FUNCTION private.advance_user_library_revision_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
    INSERT INTO public.account_library_state (user_id, current_revision)
    VALUES (OLD.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE
    SET current_revision = public.account_library_state.current_revision + 1,
        updated_at = now();
    RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.advance_user_library_revision_on_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS advance_user_library_revision_on_delete ON public.user_library;
CREATE TRIGGER advance_user_library_revision_on_delete
    AFTER DELETE ON public.user_library
    FOR EACH ROW
    EXECUTE FUNCTION private.advance_user_library_revision_on_delete();

DROP FUNCTION IF EXISTS public.assign_user_library_revision();

CREATE INDEX IF NOT EXISTS idx_user_library_access_order
    ON public.user_library (user_id, library_updated_at DESC, content_id ASC);

CREATE TABLE IF NOT EXISTS snapshot_private.account_data_snapshot_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    idempotency_key uuid NOT NULL,
    request_fingerprint text NOT NULL,
    collection_names text[] NOT NULL,
    schema_version integer NOT NULL,
    snapshot_id uuid NOT NULL UNIQUE,
    status text NOT NULL CHECK (status IN ('building', 'ready', 'failed', 'aborted')),
    failure_code text,
    lease_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS snapshot_private.account_data_snapshots (
    id uuid PRIMARY KEY,
    operation_id uuid NOT NULL UNIQUE REFERENCES snapshot_private.account_data_snapshot_operations(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    collection_names text[] NOT NULL,
    schema_version integer NOT NULL,
    reset_epoch bigint NOT NULL,
    boundary_library_revision bigint NOT NULL,
    record_count integer NOT NULL DEFAULT 0,
    payload_bytes bigint NOT NULL DEFAULT 0,
    manifest_hash text,
    status text NOT NULL CHECK (status IN ('building', 'ready')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_private.account_data_snapshot_records (
    snapshot_id uuid NOT NULL REFERENCES snapshot_private.account_data_snapshots(id) ON DELETE CASCADE,
    collection_name text NOT NULL,
    ordinal bigint NOT NULL,
    record_id text NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, collection_name, ordinal),
    UNIQUE (snapshot_id, collection_name, record_id)
);

ALTER TABLE snapshot_private.account_data_snapshot_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot_private.account_data_snapshot_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE snapshot_private.account_data_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot_private.account_data_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE snapshot_private.account_data_snapshot_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot_private.account_data_snapshot_records FORCE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA snapshot_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA snapshot_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA snapshot_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA snapshot_private TO netflux_snapshot_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA snapshot_private TO netflux_snapshot_worker;
GRANT USAGE ON SCHEMA snapshot_private TO netflux_snapshot_maintenance;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA snapshot_private TO netflux_snapshot_maintenance;
GRANT SELECT, DELETE ON public.user_library TO netflux_snapshot_worker;
GRANT SELECT, INSERT, UPDATE ON public.account_library_state TO netflux_snapshot_worker;

CREATE POLICY "Snapshot worker accesses scoped operations"
    ON snapshot_private.account_data_snapshot_operations FOR ALL
    TO netflux_snapshot_worker
    USING (account_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid)
    WITH CHECK (account_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);
CREATE POLICY "Snapshot maintenance manages operations"
    ON snapshot_private.account_data_snapshot_operations FOR ALL
    TO netflux_snapshot_maintenance
    USING (true)
    WITH CHECK (true);
CREATE POLICY "Snapshot worker accesses scoped snapshots"
    ON snapshot_private.account_data_snapshots FOR ALL
    TO netflux_snapshot_worker
    USING (account_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid)
    WITH CHECK (account_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);
CREATE POLICY "Snapshot maintenance manages snapshots"
    ON snapshot_private.account_data_snapshots FOR ALL
    TO netflux_snapshot_maintenance
    USING (true)
    WITH CHECK (true);
CREATE POLICY "Snapshot worker accesses scoped records"
    ON snapshot_private.account_data_snapshot_records FOR ALL
    TO netflux_snapshot_worker
    USING (EXISTS (
        SELECT 1 FROM snapshot_private.account_data_snapshots snapshot
        WHERE snapshot.id = snapshot_id
          AND snapshot.account_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM snapshot_private.account_data_snapshots snapshot
        WHERE snapshot.id = snapshot_id
          AND snapshot.account_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid
    ));
CREATE POLICY "Snapshot maintenance manages records"
    ON snapshot_private.account_data_snapshot_records FOR ALL
    TO netflux_snapshot_maintenance
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Snapshot worker reads scoped library"
    ON public.user_library FOR SELECT
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);
CREATE POLICY "Snapshot worker resets scoped library"
    ON public.user_library FOR DELETE
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);
CREATE POLICY "Snapshot worker reads scoped library state"
    ON public.account_library_state FOR SELECT
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);
CREATE POLICY "Snapshot worker writes scoped library state"
    ON public.account_library_state FOR INSERT
    TO netflux_snapshot_worker
    WITH CHECK (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);
CREATE POLICY "Snapshot worker updates scoped library state"
    ON public.account_library_state FOR UPDATE
    TO netflux_snapshot_worker
    USING (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid)
    WITH CHECK (user_id = NULLIF(current_setting('app.snapshot_account_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_account_data_snapshot_operations_recovery
    ON snapshot_private.account_data_snapshot_operations (status, lease_expires_at)
    WHERE status = 'building';
CREATE INDEX IF NOT EXISTS idx_account_data_snapshots_owner
    ON snapshot_private.account_data_snapshots (account_id, expires_at DESC);
