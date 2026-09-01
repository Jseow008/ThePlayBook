CREATE TABLE IF NOT EXISTS public.user_reflections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_item_id UUID NOT NULL REFERENCES public.content_item(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    reflection_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_reflections_user_content_unique UNIQUE (user_id, content_item_id),
    CONSTRAINT user_reflections_prompt_length CHECK (char_length(prompt) BETWEEN 1 AND 500),
    CONSTRAINT user_reflections_text_length CHECK (char_length(reflection_text) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_user_reflections_user_created_at
    ON public.user_reflections (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_reflections_content_item_id
    ON public.user_reflections (content_item_id);

ALTER TABLE public.user_reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reflections"
    ON public.user_reflections FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert their own reflections"
    ON public.user_reflections FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update their own reflections"
    ON public.user_reflections FOR UPDATE
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete their own reflections"
    ON public.user_reflections FOR DELETE
    USING ((SELECT auth.uid()) = user_id);
