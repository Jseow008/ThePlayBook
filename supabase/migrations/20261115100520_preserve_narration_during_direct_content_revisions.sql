-- Retain the existing narration-in-progress safeguard when direct edits are allowed.
CREATE OR REPLACE FUNCTION private.guard_annotated_content_text() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF private.quick_reading_text(NEW.quick_mode_json) IS DISTINCT FROM private.quick_reading_text(OLD.quick_mode_json) THEN
        IF private.content_has_annotations(OLD.id) THEN
            RAISE EXCEPTION 'Highlights or notes protect this text; create a linked draft'
                USING ERRCODE='P0001', HINT='CONTENT_VERSION_REQUIRED';
        END IF;
        IF OLD.narration_status='processing' THEN
            RAISE EXCEPTION 'Wait for narration to finish before revising the reading text'
                USING ERRCODE='40001';
        END IF;
        NEW.reading_revision := gen_random_uuid();
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_annotated_segment_text() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE parent_id uuid;
BEGIN
    IF TG_OP='UPDATE' AND ROW(NEW.item_id,NEW.order_index,coalesce(NEW.title,''),NEW.markdown_body,NEW.deleted_at)
        IS NOT DISTINCT FROM ROW(OLD.item_id,OLD.order_index,coalesce(OLD.title,''),OLD.markdown_body,OLD.deleted_at) THEN
        RETURN NEW;
    END IF;
    IF TG_OP='INSERT' THEN parent_id:=NEW.item_id; ELSE parent_id:=OLD.item_id; END IF;
    -- All reading changes and annotation inserts lock the same parent.
    PERFORM id FROM public.content_item
        WHERE id=parent_id OR (TG_OP='UPDATE' AND id=NEW.item_id) ORDER BY id FOR UPDATE;
    IF private.content_has_annotations(parent_id)
       OR (TG_OP='UPDATE' AND NEW.item_id IS DISTINCT FROM parent_id AND private.content_has_annotations(NEW.item_id)) THEN
        RAISE EXCEPTION 'Highlights or notes protect these sections; create a linked draft'
            USING ERRCODE='P0001', HINT='CONTENT_VERSION_REQUIRED';
    END IF;
    IF EXISTS(SELECT 1 FROM public.content_item WHERE narration_status='processing'
        AND (id=parent_id OR (TG_OP='UPDATE' AND id=NEW.item_id))) THEN
        RAISE EXCEPTION 'Wait for narration to finish before revising the reading text'
            USING ERRCODE='40001';
    END IF;
    UPDATE public.content_item SET reading_revision=gen_random_uuid()
        WHERE id=parent_id OR (TG_OP='UPDATE' AND id=NEW.item_id);
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
