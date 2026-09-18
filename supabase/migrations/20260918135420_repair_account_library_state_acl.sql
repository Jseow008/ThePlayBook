-- account_library_state is an internal synchronization boundary. Browser
-- clients use authenticated server routes; only the restricted worker needs
-- direct table access for account-scoped snapshot and mutation operations.
-- Revoke PUBLIC first because effective browser privileges include inherited
-- grants even when anon/authenticated themselves have no explicit ACL entry.
REVOKE ALL PRIVILEGES ON TABLE public.account_library_state FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.account_library_state FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.account_library_state FROM authenticated;

-- Preserve exactly the worker operations required by its existing RLS
-- policies. DELETE remains unnecessary: library resets delete user_library
-- rows and the state row is retained to carry the reset epoch.
GRANT SELECT, INSERT, UPDATE ON TABLE public.account_library_state
    TO netflux_snapshot_worker;

DO $account_library_state_acl$
BEGIN
    IF pg_catalog.has_table_privilege(
        'anon',
        'public.account_library_state',
        'SELECT, INSERT, UPDATE, DELETE'
    ) OR pg_catalog.has_table_privilege(
        'authenticated',
        'public.account_library_state',
        'SELECT, INSERT, UPDATE, DELETE'
    ) THEN
        RAISE EXCEPTION
            'account_library_state remains accessible to a browser role through an explicit or inherited grant';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class relation
        INNER JOIN pg_catalog.pg_namespace namespace
            ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
        ) AS grant_entry
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'account_library_state'
          AND grant_entry.grantee = 0
    ) THEN
        RAISE EXCEPTION
            'account_library_state retains a PUBLIC grant';
    END IF;

    IF NOT pg_catalog.has_table_privilege(
        'netflux_snapshot_worker',
        'public.account_library_state',
        'SELECT'
    ) OR NOT pg_catalog.has_table_privilege(
        'netflux_snapshot_worker',
        'public.account_library_state',
        'INSERT'
    ) OR NOT pg_catalog.has_table_privilege(
        'netflux_snapshot_worker',
        'public.account_library_state',
        'UPDATE'
    ) THEN
        RAISE EXCEPTION
            'account_library_state worker grants are incomplete';
    END IF;
END;
$account_library_state_acl$;
