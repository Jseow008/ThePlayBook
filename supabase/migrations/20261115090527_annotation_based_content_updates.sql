-- Annotation-based revisions. Existing content and edition links are not migrated.
-- NULL is the pre-migration reading revision, allowing safe rolling deployment.
ALTER TABLE public.content_item ADD COLUMN reading_revision uuid;
ALTER TABLE public.user_highlights ADD COLUMN content_revision uuid;
ALTER TABLE public.user_reflections ADD COLUMN content_revision uuid;

CREATE FUNCTION private.content_has_annotations(p_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_highlights WHERE content_item_id=p_id)
        OR EXISTS (SELECT 1 FROM public.user_reflections WHERE content_item_id=p_id);
$$;
REVOKE ALL ON FUNCTION private.content_has_annotations(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.quick_reading_text(p_value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT jsonb_build_array(p_value->'hook',p_value->'big_idea',p_value->'key_takeaways');
$$;
REVOKE ALL ON FUNCTION private.quick_reading_text(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- These guards also cover legacy/service-role writes outside the graph RPC.
CREATE FUNCTION private.guard_annotated_content_text() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF private.quick_reading_text(NEW.quick_mode_json) IS DISTINCT FROM private.quick_reading_text(OLD.quick_mode_json) THEN
        IF private.content_has_annotations(OLD.id) THEN
            RAISE EXCEPTION 'Highlights or notes protect this text; create a linked draft'
                USING ERRCODE='P0001', HINT='CONTENT_VERSION_REQUIRED';
        END IF;
        NEW.reading_revision := gen_random_uuid();
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_annotated_content_text() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER content_text_annotation_guard BEFORE UPDATE ON public.content_item
FOR EACH ROW EXECUTE FUNCTION private.guard_annotated_content_text();

CREATE FUNCTION private.guard_annotated_segment_text() RETURNS trigger
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
    UPDATE public.content_item SET reading_revision=gen_random_uuid()
        WHERE id=parent_id OR (TG_OP='UPDATE' AND id=NEW.item_id);
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_annotated_segment_text() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER segment_text_annotation_guard BEFORE INSERT OR UPDATE OR DELETE ON public.segment
FOR EACH ROW EXECUTE FUNCTION private.guard_annotated_segment_text();

CREATE FUNCTION private.guard_annotation_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_revision uuid;
BEGIN
    -- Editing an existing annotation does not change its source text.
    IF TG_OP='UPDATE' AND NEW.content_item_id=OLD.content_item_id THEN RETURN NEW; END IF;
    SELECT reading_revision INTO current_revision FROM public.content_item WHERE id=NEW.content_item_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Summary not found' USING ERRCODE='23503'; END IF;
    IF NEW.content_revision IS DISTINCT FROM current_revision THEN
        RAISE EXCEPTION 'This summary changed. Keep your note, reload the summary, and review it before saving.'
            USING ERRCODE='PT409', HINT='CONTENT_REVISION_CHANGED';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_annotation_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER annotation_revision_guard BEFORE INSERT OR UPDATE ON public.user_highlights
FOR EACH ROW EXECUTE FUNCTION private.guard_annotation_revision();
CREATE TRIGGER annotation_revision_guard BEFORE INSERT OR UPDATE ON public.user_reflections
FOR EACH ROW EXECUTE FUNCTION private.guard_annotation_revision();

CREATE OR REPLACE FUNCTION public.admin_update_content_graph(
    p_content_id uuid, p_content_patch jsonb DEFAULT '{}'::jsonb,
    p_segments jsonb DEFAULT NULL, p_artifacts jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    source public.content_item%ROWTYPE;
    current_sections jsonb;
    next_sections jsonb;
    annotated boolean;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
    END IF;
    SELECT * INTO source FROM public.content_item WHERE id=p_content_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Summary not found' USING ERRCODE='P0002'; END IF;
    IF source.update_source_id IS NOT NULL AND source.published_at IS NULL THEN
        IF p_content_patch->>'status'='verified' OR p_content_patch->>'series_id' IS NOT NULL OR p_content_patch->>'series_order' IS NOT NULL THEN
            RAISE EXCEPTION 'Use Publish updated version; its series position comes from the original'
                USING ERRCODE='P0001', HINT='CONTENT_VERSION_PUBLISH_REQUIRED';
        END IF;
    END IF;
    annotated:=private.content_has_annotations(source.id);
    IF annotated AND p_content_patch ? 'quick_mode_json'
       AND private.quick_reading_text(p_content_patch->'quick_mode_json') IS DISTINCT FROM private.quick_reading_text(source.quick_mode_json) THEN
        RAISE EXCEPTION 'Highlights or notes protect this text; create a linked draft'
            USING ERRCODE='P0001', HINT='CONTENT_VERSION_REQUIRED';
    END IF;
    IF p_segments IS NOT NULL THEN
        IF jsonb_typeof(p_segments) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Sections must be an array' USING ERRCODE='22023'; END IF;
        SELECT coalesce(jsonb_agg(jsonb_build_array(id,order_index,coalesce(title,''),markdown_body) ORDER BY order_index),'[]')
            INTO current_sections FROM public.segment WHERE item_id=source.id;
        SELECT coalesce(jsonb_agg(jsonb_build_array(s.id,s.order_index,coalesce(s.title,''),s.markdown_body) ORDER BY s.order_index),'[]')
            INTO next_sections FROM jsonb_to_recordset(p_segments) AS s(id uuid,order_index integer,title text,markdown_body text);
        IF annotated AND next_sections IS DISTINCT FROM current_sections THEN
            RAISE EXCEPTION 'Highlights or notes protect these sections; create a linked draft'
                USING ERRCODE='P0001', HINT='CONTENT_VERSION_REQUIRED';
        END IF;
    END IF;
    IF annotated AND p_segments IS NOT NULL THEN
        -- Identical annotated sections need no reconciliation/reordering. Permit
        -- timing maintenance without transient deletes or source revision changes.
        PERFORM private.update_content_graph_base(p_content_id,p_content_patch,NULL,p_artifacts);
        UPDATE public.segment s SET start_time_sec=x.start_time_sec,end_time_sec=x.end_time_sec
        FROM jsonb_to_recordset(p_segments) AS x(id uuid,start_time_sec integer,end_time_sec integer)
        WHERE s.item_id=p_content_id AND s.id=x.id;
        DELETE FROM public.segment_embedding_gemini e USING public.content_item c
        WHERE e.content_item_id=p_content_id AND c.id=p_content_id
          AND (c.deleted_at IS NOT NULL OR c.status IS DISTINCT FROM 'verified'::public.content_status);
    ELSE
        PERFORM private.update_content_graph_base(p_content_id,p_content_patch,p_segments,p_artifacts);
    END IF;
    UPDATE public.content_item SET updated_at=now() WHERE id=p_content_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_content_graph(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_content_graph(uuid,jsonb,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_create_content_version(p_source_id uuid, p_source_updated_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    source public.content_item%ROWTYPE;
    draft_id uuid;
BEGIN
    IF auth.role() IS NULL OR auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(842709225324::bigint);
    SELECT * INTO source FROM public.content_item WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Source not found' USING ERRCODE = 'P0002'; END IF;
    IF source.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Choose an available summary' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO draft_id FROM public.content_item WHERE update_source_id = source.id
        AND status = 'draft' AND deleted_at IS NULL;
    -- A repeated create resumes the same draft, including after a lost response.
    IF draft_id IS NOT NULL THEN RETURN draft_id; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.user_highlights WHERE content_item_id=source.id)
       AND NOT EXISTS(SELECT 1 FROM public.user_reflections WHERE content_item_id=source.id) THEN
        RAISE EXCEPTION 'This summary has no highlights or notes; edit it directly'
            USING ERRCODE = '22023', HINT = 'CONTENT_DIRECT_EDIT_ALLOWED';
    END IF;
    IF source.updated_at IS DISTINCT FROM p_source_updated_at OR source.narration_status = 'processing' THEN
        RAISE EXCEPTION 'Source changed or narration is processing; reload and review again' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.content_item(title, author, type, category, source_url,
        cover_image_url, hero_image_url, duration_seconds, quick_mode_json, is_featured, isbn, status, update_source_id)
    VALUES (source.title, source.author, source.type, source.category, source.source_url,
        source.cover_image_url, source.hero_image_url, source.duration_seconds, source.quick_mode_json,
        source.is_featured, source.isbn, 'draft', source.id) RETURNING id INTO draft_id;
    -- New section/artifact IDs; no personal state, audio, timings, or embeddings.
    INSERT INTO public.segment(item_id, order_index, title, markdown_body)
        SELECT draft_id, order_index, title, markdown_body FROM public.segment
        WHERE item_id = source.id AND deleted_at IS NULL ORDER BY order_index;
    INSERT INTO public.artifact(item_id, type, payload_schema, version)
        SELECT draft_id, type, payload_schema, version FROM public.artifact WHERE item_id = source.id;
    RETURN draft_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_content_version(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_content_version(uuid,timestamptz) TO service_role;



-- Atomic destination selection. An existing separate draft is never overwritten
-- implicitly; resume/review that record explicitly instead.
CREATE FUNCTION public.admin_save_content_revision(
    p_content_id uuid, p_content_patch jsonb DEFAULT '{}'::jsonb,
    p_segments jsonb DEFAULT NULL, p_artifacts jsonb DEFAULT NULL,
    p_source_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE source public.content_item%ROWTYPE; target_id uuid; existing_draft uuid; mapped_segments jsonb;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
    -- Same order as explicit edition creation/publication.
    PERFORM pg_advisory_xact_lock(842709225324::bigint);
    SELECT * INTO source FROM public.content_item WHERE id=p_content_id FOR UPDATE;
    IF NOT FOUND OR source.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Summary not found' USING ERRCODE='P0002'; END IF;
    IF p_source_updated_at IS NOT NULL AND source.updated_at IS DISTINCT FROM p_source_updated_at THEN
        RAISE EXCEPTION 'Summary changed; reload and review before saving' USING ERRCODE='40001';
    END IF;
    BEGIN
        PERFORM public.admin_update_content_graph(p_content_id,p_content_patch,p_segments,p_artifacts);
        RETURN jsonb_build_object('content_id',p_content_id,'created_version',false,'status',coalesce(p_content_patch->>'status',source.status::text));
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        -- Only annotation protection routes to a linked draft. Other failures
        -- (including publication safeguards) must propagate without side effects.
        DECLARE reason text; BEGIN
            GET STACKED DIAGNOSTICS reason=PG_EXCEPTION_HINT;
            IF reason IS DISTINCT FROM 'CONTENT_VERSION_REQUIRED' THEN RAISE; END IF;
        END;
    END;
    SELECT id INTO existing_draft FROM public.content_item WHERE update_source_id=source.id AND status='draft' AND deleted_at IS NULL;
    IF existing_draft IS NOT NULL THEN
        RAISE EXCEPTION 'An updated draft already exists. Open it and review its changes before saving.'
            USING ERRCODE='40001', HINT=existing_draft::text;
    END IF;
    target_id:=public.admin_create_content_version(source.id,source.updated_at);
    IF p_segments IS NOT NULL THEN
        -- Incoming IDs belong to the original. Map retained IDs to cloned IDs
        -- using their original ordinal; incoming reorder positions stay intact.
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_segments) e WHERE e->>'id' IS NOT NULL
            AND NOT EXISTS(SELECT 1 FROM public.segment WHERE id=(e->>'id')::uuid AND item_id=source.id)) THEN
            RAISE EXCEPTION 'Section does not belong to the original' USING ERRCODE='22023';
        END IF;
        SELECT coalesce(jsonb_agg(e.value || jsonb_build_object('id',copy.id,'start_time_sec',NULL,'end_time_sec',NULL) ORDER BY e.ordinality),'[]')
        INTO mapped_segments FROM jsonb_array_elements(p_segments) WITH ORDINALITY e(value,ordinality)
        LEFT JOIN public.segment original ON original.id=(e.value->>'id')::uuid AND original.item_id=source.id
        LEFT JOIN public.segment copy ON copy.item_id=target_id AND copy.order_index=original.order_index;
    END IF;
    p_content_patch:=(p_content_patch - ARRAY['series_id','series_order','audio_url','narration_status','narration_error','narration_requested_at','narration_started_at','narration_completed_at']) || jsonb_build_object('status','draft');
    PERFORM public.admin_update_content_graph(target_id,p_content_patch,mapped_segments,p_artifacts);
    RETURN jsonb_build_object('content_id',target_id,'created_version',true,'status','draft');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_content_revision(uuid,jsonb,jsonb,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_content_revision(uuid,jsonb,jsonb,jsonb,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_replace_content(
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
    publishing_version boolean;
BEGIN
    IF auth.role() IS NULL OR auth.role() <> 'service_role' THEN
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
    IF NOT FOUND OR target.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Replacement must be a published, available summary' USING ERRCODE = '22023';
    END IF;
    publishing_version := target.status = 'draft' AND target.update_source_id = source.id AND target.published_at IS NULL;
    IF target.status <> 'verified' AND NOT coalesce(publishing_version, false) THEN
        RAISE EXCEPTION 'Replacement must be published or its own update draft' USING ERRCODE = '22023';
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
    IF (source.status <> 'verified' AND NOT coalesce(publishing_version,false)) OR source.deleted_at IS NOT NULL
       OR source.updated_at IS DISTINCT FROM p_source_updated_at
       OR target.updated_at IS DISTINCT FROM p_replacement_updated_at THEN
        RAISE EXCEPTION 'Summary changed; review the replacement again' USING ERRCODE = '40001';
    END IF;
    IF publishing_version THEN
        IF target.narration_status = 'processing' OR target.series_id IS NOT NULL
           OR target.series_order IS NOT NULL OR nullif(trim(target.cover_image_url),'') IS NULL
           OR nullif(trim(target.category),'') IS NULL
           OR nullif(trim(target.quick_mode_json->>'hook'),'') IS NULL
           OR nullif(trim(target.quick_mode_json->>'big_idea'),'') IS NULL
           OR jsonb_typeof(target.quick_mode_json->'key_takeaways') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Updated version is missing required publish fields or is still processing' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(target.quick_mode_json->'key_takeaways') AS t(value) WHERE nullif(trim(value),'') IS NOT NULL)
           OR NOT EXISTS (SELECT 1 FROM public.segment WHERE item_id=target.id AND deleted_at IS NULL AND nullif(trim(markdown_body),'') IS NOT NULL) THEN
            RAISE EXCEPTION 'Updated version needs takeaways and readable sections' USING ERRCODE = '22023';
        END IF;
    END IF;
    SELECT count(*) INTO library_count FROM public.user_library WHERE content_id = source.id;
    SELECT count(*) INTO highlight_count FROM public.user_highlights WHERE content_item_id = source.id;
    SELECT count(*) INTO reflection_count FROM public.user_reflections WHERE content_item_id = source.id;
    UPDATE public.content_item SET deleted_at = now() WHERE id = source.id;
    INSERT INTO public.content_replacement(source_id, replacement_id, source_title)
        VALUES (source.id, target.id, source.title);
    IF publishing_version THEN
        -- In the same transaction, release the active slot and publish its successor.
        -- Archive series metadata is untouched; no duplicate public edition window.
        UPDATE public.content_item SET status='verified', series_id=source.series_id,
            series_order=source.series_order WHERE id=target.id;
    END IF;
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

