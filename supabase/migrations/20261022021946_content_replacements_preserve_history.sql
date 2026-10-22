-- Replacement is a relationship, not a migration of personal reading state.
-- Original rows, segment IDs and all personal records stay on the original ID.
CREATE TABLE public.content_replacement (
    source_id uuid PRIMARY KEY REFERENCES public.content_item(id) ON DELETE RESTRICT,
    replacement_id uuid NOT NULL REFERENCES public.content_item(id) ON DELETE RESTRICT,
    source_title text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT content_replacement_different_ids CHECK (source_id <> replacement_id)
);
CREATE INDEX content_replacement_target_idx ON public.content_replacement(replacement_id);
ALTER TABLE public.content_replacement ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_replacement FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.content_replacement TO anon, authenticated;
GRANT ALL ON public.content_replacement TO service_role;
-- Only the intentionally published replacement notice is public. Never expose
-- progress, notes, original body text, or a draft/withdrawn destination.
CREATE POLICY content_replacement_public_notice ON public.content_replacement
FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.content_item AS target
            WHERE target.id = replacement_id AND target.status = 'verified'
              AND target.deleted_at IS NULL)
);

CREATE FUNCTION public.admin_replace_content(
    p_source_id uuid, p_replacement_id uuid,
    p_source_updated_at timestamptz, p_replacement_updated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    source public.content_item%ROWTYPE;
    target public.content_item%ROWTYPE;
    library_count bigint;
    highlight_count bigint;
    reflection_count bigint;
    existing_target uuid;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    IF p_source_id IS NULL OR p_replacement_id IS NULL OR p_source_id = p_replacement_id THEN
        RAISE EXCEPTION 'Choose two different summaries' USING ERRCODE = '22023';
    END IF;
    -- Serialize replacements, then lock both parents in a stable order. Child
    -- FK inserts and graph updates cannot race the source retirement.
    PERFORM pg_catalog.pg_advisory_xact_lock(842709225324::bigint);
    PERFORM id FROM public.content_item WHERE id IN (p_source_id, p_replacement_id) ORDER BY id FOR UPDATE;
    SELECT * INTO source FROM public.content_item WHERE id = p_source_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Source not found' USING ERRCODE = 'P0002'; END IF;
    SELECT * INTO target FROM public.content_item WHERE id = p_replacement_id;
    IF NOT FOUND OR target.status <> 'verified' OR target.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Replacement must be a published, available summary' USING ERRCODE = '22023';
    END IF;
    SELECT replacement_id INTO existing_target FROM public.content_replacement WHERE source_id = p_source_id;
    IF existing_target IS NOT NULL THEN
        IF existing_target <> p_replacement_id THEN
            RAISE EXCEPTION 'This summary already has a different replacement' USING ERRCODE = '40001';
        END IF;
        RETURN pg_catalog.jsonb_build_object('source_id', source.id, 'replacement_id', target.id, 'already_replaced', true);
    END IF;
    IF source.narration_status = 'processing' THEN
        RAISE EXCEPTION 'Wait for the original narration job to finish before replacing it' USING ERRCODE = '40001';
    END IF;
    IF source.status <> 'verified' OR source.deleted_at IS NOT NULL
       OR source.updated_at IS DISTINCT FROM p_source_updated_at
       OR target.updated_at IS DISTINCT FROM p_replacement_updated_at THEN
        RAISE EXCEPTION 'Summary changed; review the replacement again' USING ERRCODE = '40001';
    END IF;
    SELECT count(*) INTO library_count FROM public.user_library WHERE content_id = source.id;
    SELECT count(*) INTO highlight_count FROM public.user_highlights WHERE content_item_id = source.id;
    SELECT count(*) INTO reflection_count FROM public.user_reflections WHERE content_item_id = source.id;
    UPDATE public.content_item SET deleted_at = now() WHERE id = source.id;
    INSERT INTO public.content_replacement(source_id, replacement_id, source_title)
        VALUES (source.id, target.id, source.title);
    -- Flatten older notices when their destination is replaced: no chains or
    -- cycles, and links never forward stale segment/audio query parameters.
    UPDATE public.content_replacement SET replacement_id = target.id WHERE replacement_id = source.id;
    RETURN pg_catalog.jsonb_build_object(
        'source_id', source.id, 'replacement_id', target.id,
        'preserved_library_records', library_count,
        'preserved_highlights', highlight_count,
        'preserved_reflections', reflection_count,
        'already_replaced', false
    );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_replace_content(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replace_content(uuid, uuid, timestamptz, timestamptz) TO service_role;

-- Catch direct SQL cleanup as well as application operations before ON DELETE
-- CASCADE can remove reading history. No automatic permanent purge is offered.
CREATE FUNCTION private.protect_content_reading_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.user_library WHERE content_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.user_highlights WHERE content_item_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.user_reflections WHERE content_item_id = OLD.id) THEN
        RAISE EXCEPTION 'Summary has personal records; archive or replace it instead of permanently deleting it'
            USING ERRCODE = '23503';
    END IF;
    RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.protect_content_reading_history() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER content_preserve_personal_history BEFORE DELETE ON public.content_item
FOR EACH ROW EXECUTE FUNCTION private.protect_content_reading_history();

-- Replaced editions are immutable archives; edits to the kept edition remain
-- governed by the existing graph/highlight preservation contract.
CREATE FUNCTION private.protect_replaced_content() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    original_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'content_item' THEN original_id := OLD.id;
    ELSIF TG_OP = 'INSERT' THEN original_id := NEW.item_id;
    ELSE original_id := OLD.item_id;
    END IF;
    IF TG_TABLE_NAME <> 'content_item' THEN
        -- Serialize child writes with retirement even when the FK is unchanged.
        PERFORM id FROM public.content_item WHERE id = original_id FOR UPDATE;
        IF TG_OP = 'UPDATE' AND NEW.item_id IS DISTINCT FROM OLD.item_id THEN
            PERFORM id FROM public.content_item WHERE id = NEW.item_id FOR UPDATE;
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.content_replacement WHERE source_id = original_id) THEN
        RAISE EXCEPTION 'Replaced summaries are read-only archives' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME <> 'content_item' AND TG_OP = 'UPDATE' THEN
        IF EXISTS (SELECT 1 FROM public.content_replacement WHERE source_id = NEW.item_id) THEN
            RAISE EXCEPTION 'Replaced summaries are read-only archives' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.protect_replaced_content() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER content_replaced_archive BEFORE UPDATE ON public.content_item
FOR EACH ROW EXECUTE FUNCTION private.protect_replaced_content();
CREATE TRIGGER segment_replaced_archive BEFORE INSERT OR UPDATE OR DELETE ON public.segment
FOR EACH ROW EXECUTE FUNCTION private.protect_replaced_content();
CREATE TRIGGER artifact_replaced_archive BEFORE INSERT OR UPDATE OR DELETE ON public.artifact
FOR EACH ROW EXECUTE FUNCTION private.protect_replaced_content();
