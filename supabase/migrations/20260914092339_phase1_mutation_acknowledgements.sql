-- Phase 1 #7 follow-up: commit a user-library mutation and its authoritative
-- library boundary in the same transaction. Clients use this acknowledgement
-- to retain a local overlay until a snapshot demonstrably includes it.
CREATE OR REPLACE FUNCTION public.apply_user_library_mutation(
    p_content_id uuid,
    p_is_bookmarked boolean,
    p_progress jsonb,
    p_last_interacted_at timestamptz,
    p_delete_if_empty boolean DEFAULT false
)
RETURNS TABLE (reset_epoch bigint, library_revision bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_account_id uuid := auth.uid();
    committed_revision bigint;
    committed_epoch bigint;
BEGIN
    IF current_account_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to mutate a library.'
            USING ERRCODE = '42501';
    END IF;

    IF p_delete_if_empty THEN
        DELETE FROM public.user_library
        WHERE user_id = current_account_id AND content_id = p_content_id;
    ELSE
        INSERT INTO public.user_library (
            user_id, content_id, is_bookmarked, progress, last_interacted_at
        ) VALUES (
            current_account_id, p_content_id, p_is_bookmarked, p_progress, p_last_interacted_at
        )
        ON CONFLICT (user_id, content_id) DO UPDATE
        SET is_bookmarked = EXCLUDED.is_bookmarked,
            progress = EXCLUDED.progress,
            last_interacted_at = EXCLUDED.last_interacted_at
        RETURNING public.user_library.library_revision INTO committed_revision;
    END IF;

    SELECT state.reset_epoch, state.current_revision
    INTO committed_epoch, committed_revision
    FROM public.account_library_state state
    WHERE state.user_id = current_account_id;

    IF committed_revision IS NULL OR committed_epoch IS NULL THEN
        -- A deletion may be an idempotent no-op for an account that has never
        -- had library state. Its authoritative boundary is the empty epoch-0
        -- library, so it can be safely reconciled by a snapshot at revision 0.
        RETURN QUERY SELECT 0::bigint, 0::bigint;
        RETURN;
    END IF;

    RETURN QUERY SELECT committed_epoch, committed_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_user_library_mutation(uuid, boolean, jsonb, timestamptz, boolean)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_user_library_mutation(uuid, boolean, jsonb, timestamptz, boolean)
    TO authenticated;
