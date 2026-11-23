-- Annotations already on an edition grant access to its archived reader.
-- Serialize first captures with retirement so a later write cannot grant access.
CREATE OR REPLACE FUNCTION private.guard_annotation_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_revision uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.content_item_id = OLD.content_item_id
       AND NEW.user_id = OLD.user_id THEN RETURN NEW; END IF;
    SELECT reading_revision INTO current_revision FROM public.content_item
        WHERE id = NEW.content_item_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Summary not found' USING ERRCODE = '23503'; END IF;
    IF EXISTS (SELECT 1 FROM public.content_replacement WHERE source_id = NEW.content_item_id)
       AND NOT EXISTS (SELECT 1 FROM public.user_highlights WHERE user_id = NEW.user_id AND content_item_id = NEW.content_item_id)
       AND NOT EXISTS (SELECT 1 FROM public.user_reflections WHERE user_id = NEW.user_id AND content_item_id = NEW.content_item_id)
    THEN
        RAISE EXCEPTION 'Open the updated summary to save a new annotation.'
            USING ERRCODE = 'PT409', HINT = 'CONTENT_VERSION_CHANGED';
    END IF;
    IF NEW.content_revision IS DISTINCT FROM current_revision THEN
        RAISE EXCEPTION 'This summary changed. Keep your note, reload the summary, and review it before saving.'
            USING ERRCODE = 'PT409', HINT = 'CONTENT_REVISION_CHANGED';
    END IF;
    RETURN NEW;
END;
$$;
