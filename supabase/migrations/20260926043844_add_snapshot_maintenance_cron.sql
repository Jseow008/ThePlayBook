-- Run account-data snapshot recovery in Postgres, beside the private state it
-- maintains. The function deliberately retains the TypeScript worker's order:
-- settle expired leases first, then expire snapshots, then prune old terminal
-- operations whose snapshots are gone.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE OR REPLACE FUNCTION snapshot_private.reconcile_expired_account_data_snapshots()
RETURNS TABLE (aborted bigint, expired bigint, pruned bigint, skipped boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, snapshot_private, pg_temp
AS $$
DECLARE
    expired_operation record;
    changed_count bigint;
    aborted_count bigint := 0;
    expired_count bigint := 0;
    pruned_count bigint := 0;
    account_lock_key text;
BEGIN
    -- A database-native caller takes this transaction lock before scanning.
    -- The legacy HTTP worker remains safe during cutover because both callers
    -- also take the per-account session lock below before changing an operation.
    IF NOT pg_catalog.pg_try_advisory_xact_lock(91_007, 91_009) THEN
        RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, true;
        RETURN;
    END IF;

    FOR expired_operation IN
        SELECT id, account_id
        FROM snapshot_private.account_data_snapshot_operations
        WHERE status = 'building' AND lease_expires_at <= now()
    LOOP
        account_lock_key := 'account-data:' || expired_operation.account_id::text;
        IF NOT pg_catalog.pg_try_advisory_lock(pg_catalog.hashtext(account_lock_key)) THEN
            CONTINUE;
        END IF;

        BEGIN
            UPDATE snapshot_private.account_data_snapshot_operations operation
            SET status = 'aborted',
                failure_code = 'SNAPSHOT_WORKER_INTERRUPTED',
                lease_expires_at = NULL,
                updated_at = now()
            WHERE operation.id = expired_operation.id
              AND operation.status = 'building'
              AND operation.lease_expires_at <= now()
              AND NOT EXISTS (
                  SELECT 1
                  FROM snapshot_private.account_data_snapshots snapshot
                  WHERE snapshot.operation_id = operation.id
                    AND snapshot.status = 'ready'
              );
            GET DIAGNOSTICS changed_count = ROW_COUNT;
            aborted_count := aborted_count + changed_count;
        EXCEPTION WHEN OTHERS THEN
            PERFORM pg_catalog.pg_advisory_unlock(pg_catalog.hashtext(account_lock_key));
            RAISE;
        END;

        PERFORM pg_catalog.pg_advisory_unlock(pg_catalog.hashtext(account_lock_key));
    END LOOP;

    DELETE FROM snapshot_private.account_data_snapshots
    WHERE expires_at <= now();
    GET DIAGNOSTICS expired_count = ROW_COUNT;

    DELETE FROM snapshot_private.account_data_snapshot_operations operation
    WHERE operation.status <> 'building'
      AND operation.updated_at < now() - interval '25 hours'
      AND NOT EXISTS (
          SELECT 1
          FROM snapshot_private.account_data_snapshots snapshot
          WHERE snapshot.operation_id = operation.id
      );
    GET DIAGNOSTICS pruned_count = ROW_COUNT;

    RETURN QUERY SELECT aborted_count, expired_count, pruned_count, false;
END;
$$;

-- The owner is the existing least-privilege cross-account maintenance role.
-- SECURITY DEFINER therefore remains subject to the FORCE RLS policies that
-- specifically allow this role, instead of executing as the migration owner.
-- The existing role-creator membership deliberately has SET disabled. Enable
-- only SET for this handoff, then revoke that option once ownership changes.
-- The target role also needs CREATE on the containing schema during transfer;
-- it is likewise revoked immediately afterwards.
GRANT netflux_snapshot_maintenance TO postgres
    WITH SET TRUE;
GRANT CREATE ON SCHEMA snapshot_private TO netflux_snapshot_maintenance;
ALTER FUNCTION snapshot_private.reconcile_expired_account_data_snapshots()
    OWNER TO netflux_snapshot_maintenance;
REVOKE ALL ON FUNCTION snapshot_private.reconcile_expired_account_data_snapshots()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION snapshot_private.reconcile_expired_account_data_snapshots()
    TO postgres;
REVOKE SET OPTION FOR netflux_snapshot_maintenance FROM postgres;
REVOKE CREATE ON SCHEMA snapshot_private FROM netflux_snapshot_maintenance;

SELECT cron.schedule(
    'reconcile-account-data-snapshots',
    '17 * * * *',
    'SELECT snapshot_private.reconcile_expired_account_data_snapshots();'
);

DO $snapshot_maintenance_cron$
BEGIN
    IF pg_catalog.has_function_privilege(
        'anon',
        'snapshot_private.reconcile_expired_account_data_snapshots()',
        'EXECUTE'
    ) OR pg_catalog.has_function_privilege(
        'authenticated',
        'snapshot_private.reconcile_expired_account_data_snapshots()',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'snapshot-maintenance function is accessible to browser roles';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM cron.job
        WHERE jobname = 'reconcile-account-data-snapshots'
          AND schedule = '17 * * * *'
          AND command = 'SELECT snapshot_private.reconcile_expired_account_data_snapshots();'
          AND active
    ) THEN
        RAISE EXCEPTION 'snapshot-maintenance cron job is missing or misconfigured';
    END IF;
END;
$snapshot_maintenance_cron$;
