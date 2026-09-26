-- All browser library mutations must pass the authenticated server's exact
-- account revision and reset-epoch checks. Keep browser SELECT and restricted
-- worker DML grants intact; do not rely on RLS alone to prevent stale writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.user_library
    FROM PUBLIC, anon, authenticated;

DO $library_mutation_acl$
DECLARE
    browser_role text;
    operation text;
BEGIN
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF pg_catalog.has_table_privilege(browser_role, 'public.user_library', 'INSERT, UPDATE, DELETE, TRUNCATE')
            OR pg_catalog.has_any_column_privilege(browser_role, 'public.user_library', 'INSERT, UPDATE') THEN
            RAISE EXCEPTION 'user_library retains effective browser write privileges for %', browser_role;
        END IF;
    END LOOP;
    IF NOT pg_catalog.has_table_privilege('authenticated', 'public.user_library', 'SELECT') THEN
        RAISE EXCEPTION 'user_library authenticated SELECT must remain available';
    END IF;
    FOREACH operation IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        IF NOT pg_catalog.has_table_privilege('netflux_snapshot_worker', 'public.user_library', operation) THEN
            RAISE EXCEPTION 'user_library worker privilege % is missing', operation;
        END IF;
    END LOOP;
END;
$library_mutation_acl$;
