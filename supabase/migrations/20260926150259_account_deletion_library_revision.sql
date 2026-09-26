-- Auth user deletion cascades through both library rows and revision state.
-- Never recreate state for an account that the same cascade has removed.
CREATE OR REPLACE FUNCTION private.advance_user_library_revision_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
    UPDATE public.account_library_state
    SET current_revision = current_revision + 1,
        updated_at = now()
    WHERE user_id = OLD.user_id;
    IF FOUND THEN
        RETURN OLD;
    END IF;

    -- Preserve recovery of missing state for a live account. The parent lock
    -- prevents deletion between checking its existence and inserting its FK.
    INSERT INTO public.account_library_state (user_id, current_revision)
    SELECT id, 1 FROM auth.users WHERE id = OLD.user_id FOR KEY SHARE
    ON CONFLICT (user_id) DO UPDATE
    SET current_revision = public.account_library_state.current_revision + 1,
        updated_at = now();
    RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.advance_user_library_revision_on_delete() FROM PUBLIC, anon, authenticated;
