-- Bound user-controlled JSON keys for the onboarding state RPC.

CREATE OR REPLACE FUNCTION public.set_onboarding_state(
    p_tour text,
    p_version text,
    p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    next_state jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF coalesce(trim(p_tour), '') = '' THEN
        RAISE EXCEPTION 'Tour key is required';
    END IF;

    IF char_length(p_tour) > 64 OR p_tour !~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN
        RAISE EXCEPTION 'Unsupported tour key';
    END IF;

    IF coalesce(trim(p_version), '') = '' THEN
        RAISE EXCEPTION 'Tour version is required';
    END IF;

    IF char_length(p_version) > 32 OR p_version !~ '^[A-Za-z0-9._-]{1,32}$' THEN
        RAISE EXCEPTION 'Unsupported tour version';
    END IF;

    IF p_status NOT IN ('dismissed', 'completed') THEN
        RAISE EXCEPTION 'Unsupported onboarding status: %', p_status;
    END IF;

    UPDATE public.profiles
    SET onboarding_state = jsonb_set(
        coalesce(onboarding_state, '{}'::jsonb),
        ARRAY[p_tour],
        jsonb_build_object(
            'version', p_version,
            'status', p_status,
            'updated_at', to_jsonb(timezone('utc', now()))
        ),
        true
    )
    WHERE id = auth.uid()
    RETURNING onboarding_state INTO next_state;

    IF next_state IS NULL THEN
        RAISE EXCEPTION 'Profile not found for current user';
    END IF;

    RETURN next_state;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_onboarding_state(text, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_onboarding_state(text, text, text)
TO authenticated, service_role;
