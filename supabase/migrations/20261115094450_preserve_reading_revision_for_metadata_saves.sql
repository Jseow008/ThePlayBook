-- Keep open readers valid during metadata/timing-only graph saves.
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
    IF p_segments IS NOT NULL AND next_sections IS NOT DISTINCT FROM current_sections THEN
        -- Identical reading text needs no reconciliation/reordering. Permit
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

