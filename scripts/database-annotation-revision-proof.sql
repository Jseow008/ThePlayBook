-- Run only as a reviewed synthetic proof; all changes roll back.
BEGIN;
SET LOCAL lock_timeout='3s';
-- Synthetic behavior proof. Always execute inside a transaction and ROLLBACK.
DO $proof$
DECLARE
    original uuid:=gen_random_uuid(); section uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
    high_item uuid:=gen_random_uuid(); high_section uuid:=gen_random_uuid();
    published timestamptz; revision uuid; receipt jsonb; target uuid; target_section uuid; original_body text;
BEGIN
    PERFORM set_config('request.jwt.claim.role','service_role',true);
    INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
        VALUES(actor,actor::text||'@example.invalid','{}','{}');
    INSERT INTO public.content_item(id,title,type,status,quick_mode_json,category,cover_image_url)
        VALUES(original,'Synthetic annotation proof '||original,'article','verified','{"hook":"Original","big_idea":"Idea","key_takeaways":["One"]}','Business','https://example.invalid/cover.png');
    INSERT INTO public.segment(id,item_id,order_index,title,markdown_body)
        VALUES(section,original,0,'Section','Original quotation');
    SELECT published_at INTO published FROM public.content_item WHERE id=original;
    INSERT INTO public.user_library(user_id,content_id,is_bookmarked,progress)
        VALUES(actor,original,true,'{"lastSegmentIndex":0,"completed":[]}');
    -- Timing maintenance must not invalidate an open reader's reading revision.
    SELECT reading_revision INTO revision FROM public.content_item WHERE id=original;
    PERFORM public.admin_update_content_graph(original,'{}',jsonb_build_array(jsonb_build_object(
        'id',section,'order_index',0,'title','Section','markdown_body','Original quotation','start_time_sec',1,'end_time_sec',10)),NULL);
    ASSERT (SELECT reading_revision=revision FROM public.content_item WHERE id=original),'timing-only save invalidated an open reader';
    -- Publication history alone must not prevent same-ID edits or draft status.
    receipt:=public.admin_save_content_revision(original,'{"status":"draft","quick_mode_json":{"hook":"Revised","big_idea":"Idea","key_takeaways":["One"]}}',
        jsonb_build_array(jsonb_build_object('id',section,'order_index',0,'title','Section','markdown_body','Revised quotation')),NULL);
    ASSERT receipt->>'content_id'=original::text AND receipt->>'created_version'='false','unannotated edit changed identity';
    ASSERT (SELECT status='draft' AND published_at=published FROM public.content_item WHERE id=original),'status/history changed';
    ASSERT (SELECT is_bookmarked AND progress='{"lastSegmentIndex":0,"completed":[]}'::jsonb FROM public.user_library WHERE user_id=actor AND content_id=original),'bookmark/progress changed';
    BEGIN
        PERFORM public.admin_create_content_version(original,(SELECT updated_at FROM public.content_item WHERE id=original));
        RAISE EXCEPTION 'unnecessary linked draft created';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
    SELECT reading_revision INTO revision FROM public.content_item WHERE id=original;
    -- Stale annotation payloads must fail before any annotation is saved.
    BEGIN
        INSERT INTO public.user_highlights(user_id,content_item_id,segment_id,highlighted_text,content_revision)
            VALUES(actor,original,section,'Original quotation',NULL);
        RAISE EXCEPTION 'stale highlight was accepted';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
    BEGIN
        INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text,content_revision)
            VALUES(actor,original,'Prompt','Stale reflection',NULL);
        RAISE EXCEPTION 'stale reflection was accepted';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
    INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text,content_revision)
        VALUES(actor,original,'Prompt','Personal note',revision);
    -- Cross-user protection also applies to records currently in draft status.
    PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
    BEGIN
        UPDATE public.content_item SET quick_mode_json='{"hook":"Unsafe","big_idea":"Idea","key_takeaways":["One"]}' WHERE id=original;
        RAISE EXCEPTION 'direct text bypass accepted';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
    BEGIN
        UPDATE public.segment SET markdown_body='Unsafe' WHERE id=section;
        RAISE EXCEPTION 'direct section bypass accepted';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
    BEGIN
        DELETE FROM public.segment WHERE id=section;
        RAISE EXCEPTION 'direct delete bypass accepted';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
    BEGIN
        INSERT INTO public.segment(item_id,order_index,markdown_body) VALUES(original,1,'Unsafe addition');
        RAISE EXCEPTION 'direct insert bypass accepted';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
    -- Metadata/timing maintenance remains direct, including extra Quick metadata.
    PERFORM public.admin_update_content_graph(original,'{"title":"Synthetic safe metadata","quick_mode_json":{"hook":"Revised","big_idea":"Idea","key_takeaways":["One"],"category":"History"}}',
        jsonb_build_array(jsonb_build_object('id',section,'order_index',0,'title','Section','markdown_body','Revised quotation','start_time_sec',1,'end_time_sec',10)),NULL);
    ASSERT (SELECT reading_revision=revision FROM public.content_item WHERE id=original),'metadata invalidated reading revision';
    receipt:=public.admin_save_content_revision(original,'{"status":"verified","quick_mode_json":{"hook":"Linked rewrite","big_idea":"Idea","key_takeaways":["One"]}}',
        jsonb_build_array(jsonb_build_object('id',section,'order_index',0,'title','New section','markdown_body','Linked quotation')),NULL);
    target:=(receipt->>'content_id')::uuid;
    ASSERT target<>original AND receipt->>'created_version'='true' AND receipt->>'status'='draft','reflection did not produce linked draft';
    ASSERT (SELECT status='draft' AND update_source_id=original AND published_at IS NULL FROM public.content_item WHERE id=target),'linked draft status/source wrong';
    ASSERT (SELECT markdown_body='Revised quotation' FROM public.segment WHERE id=section),'original section changed';
    ASSERT (SELECT quick_mode_json->>'hook'='Revised' AND published_at=published AND status='draft' FROM public.content_item WHERE id=original),'original metadata/history changed';
    SELECT id INTO target_section FROM public.segment WHERE item_id=target;
    ASSERT target_section<>section AND (SELECT markdown_body='Linked quotation' FROM public.segment WHERE id=target_section),'cloned ID/text wrong';
    BEGIN
        PERFORM public.admin_save_content_revision(original,'{"quick_mode_json":{"hook":"Conflicting work","big_idea":"Idea","key_takeaways":["One"]}}',NULL,NULL);
        RAISE EXCEPTION 'existing draft overwritten';
    EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
    ASSERT (SELECT quick_mode_json->>'hook'='Linked rewrite' FROM public.content_item WHERE id=target),'existing draft text changed';
    -- Explicit creation must work under the actual service-role privileges.
    SET LOCAL ROLE service_role;
    ASSERT public.admin_create_content_version(original,(SELECT updated_at FROM public.content_item WHERE id=original))=target,'resume failed';
    RESET ROLE;
    -- Highlights without attached notes also protect the whole reading text.
    INSERT INTO public.content_item(id,title,type,status,quick_mode_json)
        VALUES(high_item,'Synthetic highlight proof '||high_item,'article','draft','{"hook":"Highlight source","big_idea":"Idea","key_takeaways":["One"]}');
    INSERT INTO public.segment(id,item_id,order_index,title,markdown_body) VALUES(high_section,high_item,0,'Section','Highlighted quotation');
    INSERT INTO public.user_highlights(user_id,content_item_id,segment_id,highlighted_text,content_revision)
        SELECT actor,high_item,high_section,'Highlighted quotation',reading_revision FROM public.content_item WHERE id=high_item;
    BEGIN
        PERFORM public.admin_update_content_graph(high_item,'{"quick_mode_json":{"hook":"Unsafe rewrite","big_idea":"Idea","key_takeaways":["One"]}}',NULL,NULL);
        RAISE EXCEPTION 'highlight-only protection failed';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
    DELETE FROM public.user_highlights WHERE content_item_id=high_item;
    receipt:=public.admin_save_content_revision(high_item,'{"quick_mode_json":{"hook":"Safe after deletion","big_idea":"Idea","key_takeaways":["One"]}}',NULL,NULL);
    ASSERT receipt->>'content_id'=high_item::text AND receipt->>'created_version'='false','deleted annotations still blocked editing';
    ASSERT NOT has_function_privilege('authenticated','public.admin_save_content_revision(uuid,jsonb,jsonb,jsonb,timestamptz)','EXECUTE'),'authenticated admin RPC access';
    ASSERT NOT has_function_privilege('anon','public.admin_save_content_revision(uuid,jsonb,jsonb,jsonb,timestamptz)','EXECUTE'),'anon admin RPC access';
END;
$proof$;
SELECT 'PASS: direct edits, annotations, reflection-only, cross-user, draft originals, source preservation, stale submissions, legacy writes, existing drafts, metadata, deletion, ACLs' AS proof;

ROLLBACK;
