-- Remove authenticated-callable SECURITY DEFINER warnings for user-scoped helpers.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

DROP POLICY IF EXISTS "Users can update own onboarding state" ON public.profiles;
CREATE POLICY "Users can update own onboarding state"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (onboarding_state) ON public.profiles TO authenticated;

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

REVOKE EXECUTE ON FUNCTION public.is_admin()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin()
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_onboarding_state(text, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_onboarding_state(text, text, text)
TO authenticated, service_role;
