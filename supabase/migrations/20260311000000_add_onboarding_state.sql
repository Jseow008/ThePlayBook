-- Add synced onboarding state to profiles and expose a safe per-user updater.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_state jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.set_onboarding_state(
    p_tour text,
    p_version text,
    p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

    IF coalesce(trim(p_version), '') = '' THEN
        RAISE EXCEPTION 'Tour version is required';
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

REVOKE ALL ON FUNCTION public.set_onboarding_state(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_onboarding_state(text, text, text) TO authenticated;
