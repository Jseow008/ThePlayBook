-- Reconcile production-only ACL drift without recreating the affected
-- functions. Trigger helpers are invoked by PostgreSQL, not directly by API
-- roles, so their callable grants must remain revoked.
DO $$
DECLARE
    target regprocedure;
BEGIN
    target := to_regprocedure('public.prevent_duplicate_active_book()');

    IF target IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON FUNCTION ' || target || ' FROM PUBLIC, anon, authenticated';
    END IF;
END;
$$;
