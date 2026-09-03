REVOKE ALL ON TABLE public.user_reflections FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_reflections TO authenticated;

DROP POLICY IF EXISTS "Users can view their own reflections" ON public.user_reflections;
CREATE POLICY "Users can view their own reflections"
    ON public.user_reflections FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own reflections" ON public.user_reflections;
CREATE POLICY "Users can insert their own reflections"
    ON public.user_reflections FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own reflections" ON public.user_reflections;
CREATE POLICY "Users can update their own reflections"
    ON public.user_reflections FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own reflections" ON public.user_reflections;
CREATE POLICY "Users can delete their own reflections"
    ON public.user_reflections FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);
