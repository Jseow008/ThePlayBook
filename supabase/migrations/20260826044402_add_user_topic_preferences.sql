CREATE TABLE public.user_topic_preferences (
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    topic_key text NOT NULL CHECK (topic_key IN (
        'habits_productivity', 'mindset_philosophy', 'wealth_investing', 'business_strategy',
        'ai_emerging_tech', 'cognitive_science_brain', 'human_behavior_social',
        'health_longevity_nutrition', 'science_universe', 'spirituality_meaning'
    )),
    source text NOT NULL DEFAULT 'onboarding' CHECK (source IN ('onboarding', 'settings')),
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (user_id, topic_key)
);

ALTER TABLE public.user_topic_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_topic_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_topic_preferences TO authenticated;

CREATE POLICY "Users can view their own topic preferences"
    ON public.user_topic_preferences FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert their own topic preferences"
    ON public.user_topic_preferences FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update their own topic preferences"
    ON public.user_topic_preferences FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete their own topic preferences"
    ON public.user_topic_preferences FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = user_id);

CREATE TRIGGER update_user_topic_preferences_updated_at
    BEFORE UPDATE ON public.user_topic_preferences
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
