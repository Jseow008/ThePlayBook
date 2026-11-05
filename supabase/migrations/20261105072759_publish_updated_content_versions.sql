-- An edition draft belongs to one published source. Personal records never move.
ALTER TABLE public.content_item ADD COLUMN update_source_id uuid
    REFERENCES public.content_item(id) ON DELETE RESTRICT;
ALTER TABLE public.content_item ADD CONSTRAINT content_version_different_source
    CHECK (update_source_id IS NULL OR update_source_id <> id);
CREATE UNIQUE INDEX content_one_update_draft ON public.content_item(update_source_id)
    WHERE update_source_id IS NOT NULL AND status = 'draft' AND deleted_at IS NULL;
CREATE INDEX content_update_source_idx ON public.content_item(update_source_id)
    WHERE update_source_id IS NOT NULL;
-- Archives retain the series/ordinal they had. Only active rows reserve a slot.
DROP INDEX public.idx_content_item_series_order_unique;
CREATE UNIQUE INDEX idx_content_item_series_order_unique
    ON public.content_item(series_id, series_order)
    WHERE series_id IS NOT NULL AND deleted_at IS NULL;

-- A linked unpublished edition may share book identity with its original.
-- Normal drafts and all published editions keep the existing uniqueness rules.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_book()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_author text;
  v_title text;
  v_conflicting_id uuid;
begin
  if new.type <> 'book'::public.content_type or new.deleted_at is not null
     or (new.update_source_id is not null and new.status = 'draft') then
    return new;
  end if;

  v_author := public.normalize_book_identity_text(new.author);
  v_title := public.canonical_book_base_title(new.title);

  if v_author = '' or v_title = '' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_title || '|' || v_author, 0)
  );

  select item.id
    into v_conflicting_id
  from public.content_item as item
  where item.type = 'book'::public.content_type
    and item.deleted_at is null
    and (item.update_source_id is null or item.status = 'verified')
    and item.id is distinct from new.id
    and public.canonical_book_base_title(item.title) = v_title
    and public.normalize_book_identity_text(item.author) = v_author
  limit 1;

  if v_conflicting_id is not null then
    raise exception using
      errcode = '23505',
      message = 'duplicate active book title and author',
      detail = 'Existing content_item id: ' || v_conflicting_id::text,
      constraint = 'content_item_active_book_identity_guard';
  end if;

  return new;
end;
$function$;

DROP INDEX public.idx_content_item_active_book_isbn_unique;
CREATE UNIQUE INDEX idx_content_item_active_book_isbn_unique
ON public.content_item USING btree (isbn)
WHERE type = 'book'::public.content_type AND isbn IS NOT NULL AND deleted_at IS NULL
  AND (update_source_id IS NULL OR status = 'verified');

DROP TRIGGER IF EXISTS prevent_duplicate_active_book_trigger ON public.content_item;
CREATE TRIGGER prevent_duplicate_active_book_trigger
BEFORE INSERT OR UPDATE OF title, author, type, deleted_at, status, update_source_id ON public.content_item
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_active_book();


CREATE FUNCTION public.admin_create_content_version(p_source_id uuid, p_source_updated_at timestamptz)
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
    IF source.status <> 'verified' OR source.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Choose an available published summary' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO draft_id FROM public.content_item WHERE update_source_id = source.id
        AND status = 'draft' AND deleted_at IS NULL;
    -- A repeated create resumes the same draft, including after a lost response.
    IF draft_id IS NOT NULL THEN RETURN draft_id; END IF;
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

-- Preserve the established reconciliation implementation behind a guarded entry.
ALTER FUNCTION public.admin_update_content_graph(uuid,jsonb,jsonb,jsonb) SET SCHEMA private;
ALTER FUNCTION private.admin_update_content_graph(uuid,jsonb,jsonb,jsonb) RENAME TO update_content_graph_base;
REVOKE ALL ON FUNCTION private.update_content_graph_base(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.admin_update_content_graph(
    p_content_id uuid, p_content_patch jsonb DEFAULT '{}'::jsonb,
    p_segments jsonb DEFAULT NULL, p_artifacts jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    source public.content_item%ROWTYPE;
    current_sections jsonb;
    next_sections jsonb;
BEGIN
    IF auth.role() IS NULL OR auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO source FROM public.content_item WHERE id = p_content_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Summary not found' USING ERRCODE = 'P0002'; END IF;
    IF source.update_source_id IS NOT NULL AND source.published_at IS NULL THEN
        IF p_content_patch->>'status' = 'verified'
            OR p_content_patch->>'series_id' IS NOT NULL OR p_content_patch->>'series_order' IS NOT NULL THEN
            RAISE EXCEPTION 'Use Publish updated version; its series position comes from the original'
                USING ERRCODE = 'P0001', HINT = 'CONTENT_VERSION_PUBLISH_REQUIRED';
        END IF;
    END IF;
    -- published_at survives Save as Draft, so downgrading cannot bypass this.
    IF source.published_at IS NOT NULL THEN
        IF p_content_patch ? 'quick_mode_json' AND p_content_patch->'quick_mode_json' IS DISTINCT FROM source.quick_mode_json THEN
            RAISE EXCEPTION 'Create an updated version before rewriting published text'
                USING ERRCODE = 'P0001', HINT = 'CONTENT_VERSION_REQUIRED';
        END IF;
        IF p_segments IS NOT NULL THEN
            IF pg_catalog.jsonb_typeof(p_segments) IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION 'Sections must be an array' USING ERRCODE = '22023';
            END IF;
            SELECT coalesce(jsonb_agg(jsonb_build_array(id,order_index,coalesce(nullif(title,''),''),markdown_body) ORDER BY order_index), '[]')
                INTO current_sections FROM public.segment WHERE item_id = source.id;
            SELECT coalesce(jsonb_agg(jsonb_build_array(s.id,s.order_index,coalesce(nullif(s.title,''),''),s.markdown_body) ORDER BY s.order_index), '[]')
                INTO next_sections FROM jsonb_to_recordset(p_segments) AS s(id uuid,order_index integer,title text,markdown_body text);
            IF next_sections IS DISTINCT FROM current_sections THEN
                RAISE EXCEPTION 'Create an updated version before rewriting published sections'
                    USING ERRCODE = 'P0001', HINT = 'CONTENT_VERSION_REQUIRED';
            END IF;
        END IF;
    END IF;
    PERFORM private.update_content_graph_base(p_content_id,p_content_patch,p_segments,p_artifacts);
    -- Child-only graph saves must also invalidate a publication review timestamp.
    UPDATE public.content_item SET updated_at = now() WHERE id = p_content_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_content_graph(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_content_graph(uuid,jsonb,jsonb,jsonb) TO service_role;

-- A version draft cannot be exposed by bulk/direct publication before retirement.
CREATE FUNCTION private.guard_content_version_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.update_source_id IS DISTINCT FROM OLD.update_source_id THEN
        RAISE EXCEPTION 'An edition source is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.update_source_id IS NOT NULL AND NEW.status = 'verified'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'verified')
       AND NOT EXISTS (SELECT 1 FROM public.content_replacement r
           JOIN public.content_item c ON c.id = r.source_id
           WHERE r.source_id = NEW.update_source_id AND r.replacement_id = NEW.id AND c.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Use Publish updated version' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_content_version_publication() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER content_version_publication BEFORE INSERT OR UPDATE ON public.content_item
    FOR EACH ROW EXECUTE FUNCTION private.guard_content_version_publication();

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
    IF source.status <> 'verified' OR source.deleted_at IS NOT NULL
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

