-- Run only on a disposable database. All changes roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';

DO $test$
DECLARE
    reader_a uuid := gen_random_uuid();
    reader_b uuid := gen_random_uuid();
    older uuid := gen_random_uuid();
    newer uuid := gen_random_uuid();
    stale uuid := gen_random_uuid();
    saved uuid := gen_random_uuid();
    topic text := 'Popular verification';
    yesterday text := to_char((now() - interval '1 day') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    outdated text := to_char((now() - interval '31 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    recent text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    ranked uuid[];
BEGIN
    IF has_function_privilege('anon','public.get_popular_reading_content(public.content_type,text[])','EXECUTE')
      OR has_function_privilege('authenticated','public.get_popular_reading_content(public.content_type,text[])','EXECUTE')
      OR has_table_privilege('anon','private.title_reading_progress','SELECT')
      OR has_table_privilege('authenticated','private.title_reading_progress','SELECT')
      OR NOT has_function_privilege('service_role','public.get_popular_reading_content(public.content_type,text[])','EXECUTE')
    THEN RAISE EXCEPTION 'Unexpected ranking privileges'; END IF;

    INSERT INTO auth.users(id,email) VALUES
        (reader_a, reader_a::text || '@example.invalid'),
        (reader_b, reader_b::text || '@example.invalid');
    INSERT INTO public.content_item(id,type,title,category,status,created_at) VALUES
        (older,'book','Earlier book',topic,'verified',now() - interval '1 year'),
        (newer,'article','Later article',topic,'verified',now()),
        (stale,'article','Old activity',topic,'verified',now()),
        (saved,'book','Saved book',topic,'verified',now());
    INSERT INTO public.user_library(user_id,content_id,progress,is_bookmarked) VALUES
        (reader_a,older,jsonb_build_object('completed',ARRAY['s1'],'lastSegmentIndex',0,'lastReadAt',yesterday),false),
        (reader_b,older,jsonb_build_object('completed',ARRAY[]::text[],'lastSegmentIndex',1,'lastReadAt',yesterday),false),
        (reader_a,newer,jsonb_build_object('completed',ARRAY['s1'],'lastReadAt',recent),false),
        (reader_a,stale,jsonb_build_object('completed',ARRAY['old'],'lastReadAt',outdated),true),
        (reader_b,saved,jsonb_build_object('completed',ARRAY[]::text[],'lastSegmentIndex',0,'lastReadAt',recent),true);

    UPDATE public.user_library SET is_bookmarked = false, progress = progress || jsonb_build_object('lastReadAt',recent)
    WHERE user_id = reader_a AND content_id = stale;
    UPDATE public.user_library SET progress = progress || jsonb_build_object('completed',ARRAY['s1','s2'])
    WHERE user_id = reader_a AND content_id = newer;

    SELECT array_agg(id ORDER BY ordinality) INTO ranked
    FROM public.get_popular_reading_content(NULL, ARRAY[topic]) WITH ORDINALITY;
    IF ranked IS DISTINCT FROM ARRAY[older,newer] THEN RAISE EXCEPTION 'Unexpected distinct-reader ranking: %', ranked; END IF;
    SELECT array_agg(id) INTO ranked FROM public.get_popular_reading_content('article', ARRAY[topic]);
    IF ranked IS DISTINCT FROM ARRAY[newer] THEN RAISE EXCEPTION 'Format filter failed'; END IF;
    UPDATE public.content_item SET deleted_at = now() WHERE id = newer;
    IF EXISTS (SELECT FROM public.get_popular_reading_content(NULL, ARRAY[topic]) WHERE id = newer)
    THEN RAISE EXCEPTION 'Deleted title entered the ranking'; END IF;

    UPDATE public.user_library SET progress = NULL, is_bookmarked = true WHERE user_id = reader_a AND content_id = older;
    DELETE FROM public.user_library WHERE user_id = reader_b AND content_id = older;
    IF EXISTS (SELECT FROM private.title_reading_progress WHERE content_id = older)
    THEN RAISE EXCEPTION 'Cleared Library history survived'; END IF;
END;
$test$;

SET LOCAL ROLE service_role;
SELECT count(*) FROM public.get_popular_reading_content();
ROLLBACK;
