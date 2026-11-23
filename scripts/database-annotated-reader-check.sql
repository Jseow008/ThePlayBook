-- Use a disposable database with the full schema. No fixture persists.
BEGIN;
DO $test$
DECLARE
    original uuid := gen_random_uuid();
    latest uuid := gen_random_uuid();
    owner_id uuid := gen_random_uuid();
    unrelated_id uuid := gen_random_uuid();
BEGIN
    INSERT INTO auth.users(id,email) VALUES
        (owner_id,owner_id::text || '@example.invalid'),
        (unrelated_id,unrelated_id::text || '@example.invalid');
    INSERT INTO public.content_item(id,type,title,status) VALUES
        (original,'book','Earlier edition','verified'),(latest,'book','Current edition','verified');
    INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text)
        VALUES (owner_id,original,'Question','Original reflection');
    UPDATE public.content_item SET deleted_at = now() WHERE id = original;
    INSERT INTO public.content_replacement(source_id,replacement_id,source_title)
        VALUES(original,latest,'Earlier edition');

    -- An existing reflection gives its owner access to edit and annotate the source.
    INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text)
        VALUES (owner_id,original,'Question','Updated reflection')
        ON CONFLICT(user_id,content_item_id) DO UPDATE SET reflection_text=EXCLUDED.reflection_text;
    INSERT INTO public.user_highlights(user_id,content_item_id,highlighted_text)
        VALUES (owner_id,original,'A remembered passage');

    BEGIN
        INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text)
            VALUES (unrelated_id,original,'Question','Unrelated reflection');
        RAISE EXCEPTION 'First archive reflection unexpectedly accepted';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    BEGIN
        INSERT INTO public.user_highlights(user_id,content_item_id,highlighted_text)
            VALUES (unrelated_id,original,'Unrelated highlight');
        RAISE EXCEPTION 'First archive highlight unexpectedly accepted';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text)
        VALUES (unrelated_id,latest,'Question','Current reflection');
    BEGIN
        UPDATE public.user_reflections SET content_item_id=original
        WHERE user_id=unrelated_id AND content_item_id=latest;
        RAISE EXCEPTION 'Moving annotation into archive unexpectedly accepted';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
END;
$test$;
ROLLBACK;
