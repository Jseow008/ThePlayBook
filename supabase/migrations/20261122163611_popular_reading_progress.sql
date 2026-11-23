-- One dated observation per account and title. Removing Library history also
-- removes its contribution. No individual reader data is exposed to clients.
CREATE TABLE private.title_reading_progress (
    user_id uuid NOT NULL,
    content_id uuid NOT NULL,
    advanced_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, content_id),
    FOREIGN KEY (user_id, content_id)
        REFERENCES public.user_library(user_id, content_id) ON DELETE CASCADE
);
ALTER TABLE private.title_reading_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.title_reading_progress FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON private.title_reading_progress TO service_role;
CREATE INDEX title_reading_progress_recent_idx
    ON private.title_reading_progress (advanced_at DESC, content_id);

-- Library JSON predates schema validation. Ignore missing/invalid dates,
-- including relative PostgreSQL literals such as 'now'.
CREATE FUNCTION private.reading_event_time(value text) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT CASE WHEN value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$'
                 AND pg_input_is_valid(value, 'timestamp with time zone')
                THEN value::timestamptz END;
$$;
REVOKE ALL ON FUNCTION private.reading_event_time(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.observe_title_reading_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    previous jsonb := OLD.progress;
    previous_index jsonb;
    next_index jsonb;
    advanced_at timestamptz;
BEGIN
    IF NEW.progress IS NOT DISTINCT FROM previous THEN RETURN NULL; END IF;
    IF NEW.progress IS NULL OR NEW.progress IN ('null'::jsonb, '{}'::jsonb) THEN
        DELETE FROM private.title_reading_progress
        WHERE user_id = NEW.user_id AND content_id = NEW.content_id;
        RETURN NULL;
    END IF;

    -- The first section can be open on entry. Count moving beyond it, or an
    -- explicitly completed section. Reopens, bookmarks and archive edits do
    -- not advance either signal. Both index keys exist in historical clients.
    IF jsonb_typeof(NEW.progress) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
    IF jsonb_typeof(previous) = 'object' THEN
        SELECT value INTO previous_index FROM jsonb_each(previous)
        WHERE key IN ('lastSegmentIndex','maxSegmentIndex') AND jsonb_typeof(value) = 'number'
        ORDER BY value DESC LIMIT 1;
    END IF;
    SELECT value INTO next_index FROM jsonb_each(NEW.progress)
    WHERE key IN ('lastSegmentIndex','maxSegmentIndex') AND jsonb_typeof(value) = 'number'
    ORDER BY value DESC LIMIT 1;

    IF (coalesce(next_index, '0'::jsonb) > greatest('0'::jsonb, previous_index)
            OR (jsonb_typeof(NEW.progress->'completed') = 'array' AND NEW.progress->'completed' <> '[]'::jsonb
                AND NOT coalesce(previous->'completed', '[]'::jsonb) @> (NEW.progress->'completed'))) IS NOT TRUE THEN
        RETURN NULL;
    END IF;
    advanced_at := private.reading_event_time(NEW.progress->>'lastReadAt');
    IF advanced_at IS NULL OR advanced_at > statement_timestamp() + interval '5 minutes' THEN RETURN NULL; END IF;
    INSERT INTO private.title_reading_progress AS stored (user_id, content_id, advanced_at)
    VALUES (NEW.user_id, NEW.content_id, least(advanced_at, statement_timestamp()))
    ON CONFLICT (user_id, content_id) DO UPDATE
        SET advanced_at = greatest(stored.advanced_at, EXCLUDED.advanced_at);
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.observe_title_reading_progress() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER observe_title_reading_progress
AFTER INSERT OR UPDATE OF progress ON public.user_library
FOR EACH ROW EXECUTE FUNCTION private.observe_title_reading_progress();

-- A historic finish has its own timestamp. Historic partial snapshots have no
-- reliable time of advancement, so they join the ranking on their next advance.
INSERT INTO private.title_reading_progress (user_id, content_id, advanced_at)
SELECT user_id, content_id, private.reading_event_time(progress->>'completedAt')
FROM public.user_library
WHERE progress->'isCompleted' = 'true'::jsonb
  AND jsonb_typeof(progress->'completed') = 'array' AND progress->'completed' <> '[]'::jsonb
  AND private.reading_event_time(progress->>'completedAt')
      BETWEEN now() - interval '30 days' AND now();

CREATE FUNCTION public.get_popular_reading_content(
    p_type public.content_type DEFAULT NULL, p_categories text[] DEFAULT NULL
)
RETURNS TABLE (
    id uuid, type public.content_type, title text, author text, category text,
    cover_image_url text, duration_seconds integer, created_at timestamptz,
    quick_mode_json jsonb, audio_url text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT c.id, c.type, c.title, c.author, c.category, c.cover_image_url,
           c.duration_seconds, c.created_at, c.quick_mode_json, c.audio_url
    FROM public.content_item c
    JOIN (
        SELECT content_id, count(*) AS readers, max(advanced_at) AS latest
        FROM private.title_reading_progress
        WHERE advanced_at BETWEEN now() - interval '30 days' AND now()
        GROUP BY content_id
    ) activity ON activity.content_id = c.id
    WHERE c.status = 'verified' AND c.deleted_at IS NULL
      AND (p_type IS NULL OR c.type = p_type)
      AND (p_categories IS NULL OR c.category = ANY(p_categories))
    ORDER BY activity.readers DESC, activity.latest DESC, c.id
    LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.get_popular_reading_content(public.content_type, text[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_popular_reading_content(public.content_type, text[]) TO service_role;
