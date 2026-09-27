-- Rate admission lives below PostgREST so direct authenticated writes cannot
-- bypass it. One bounded row per account/collection, removed with the account.
CREATE TABLE private.capture_write_budget (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    collection text NOT NULL CHECK (collection IN ('user_highlights','user_reflections')),
    window_started_at timestamptz NOT NULL,
    writes integer NOT NULL CHECK (writes BETWEEN 1 AND 30),
    PRIMARY KEY (user_id, collection)
);
ALTER TABLE private.capture_write_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.capture_write_budget FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.admit_capture_write(p_collection text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s'
AS $$
DECLARE
    actor uuid := auth.uid();
    at_time timestamptz;
    budget private.capture_write_budget%ROWTYPE;
    ceiling integer := CASE p_collection WHEN 'user_highlights' THEN 30 WHEN 'user_reflections' THEN 12 ELSE NULL END;
BEGIN
    IF actor IS NULL OR ceiling IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
        RAISE EXCEPTION 'Authenticated capture scope required' USING ERRCODE='42501';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('capture-write:' || actor::text || ':' || p_collection, 0));
    at_time := pg_catalog.clock_timestamp();
    SELECT * INTO budget FROM private.capture_write_budget WHERE user_id=actor AND collection=p_collection;
    IF FOUND AND budget.window_started_at > at_time - interval '60 seconds' THEN
        IF budget.writes >= ceiling THEN
            RAISE EXCEPTION 'Too many capture changes. Retry shortly.' USING ERRCODE='PT429';
        END IF;
        UPDATE private.capture_write_budget SET writes=writes+1 WHERE user_id=actor AND collection=p_collection;
    ELSE
        INSERT INTO private.capture_write_budget VALUES (actor,p_collection,at_time,1)
        ON CONFLICT (user_id,collection) DO UPDATE SET window_started_at=EXCLUDED.window_started_at,writes=1;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.admit_capture_write(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.guard_capture_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s'
AS $$
DECLARE
    highlight_count bigint;
BEGIN
    -- Service workers, editorial corrections and Auth cascades retain their
    -- existing trusted controls. User requests are identified by signed claims.
    IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Capture owner mismatch' USING ERRCODE='42501';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('capture-write:' || NEW.user_id::text || ':' || TG_TABLE_NAME, 0));
    IF TG_TABLE_NAME='user_highlights' THEN
        IF TG_OP='INSERT' OR NEW.highlighted_text IS DISTINCT FROM OLD.highlighted_text
           OR NEW.note_body IS DISTINCT FROM OLD.note_body THEN
            IF char_length(btrim(NEW.highlighted_text)) < 1 OR char_length(NEW.highlighted_text)>2000
               OR coalesce(char_length(NEW.note_body),0)>4000 THEN
                RAISE EXCEPTION 'Capture text exceeds its bounds' USING ERRCODE='22001';
            END IF;
        END IF;
        IF TG_OP='INSERT' OR NEW.content_item_id IS DISTINCT FROM OLD.content_item_id THEN
            SELECT count(*) INTO highlight_count FROM public.user_highlights
            WHERE user_id=NEW.user_id AND content_item_id=NEW.content_item_id AND id<>NEW.id;
            IF highlight_count>=50 THEN
                RAISE EXCEPTION 'Maximum of 50 highlights per item reached.' USING ERRCODE='PT403';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_capture_write() FROM PUBLIC, anon, authenticated, service_role;

-- AFTER counts an upsert once: PostgreSQL can run both BEFORE INSERT and
-- BEFORE UPDATE for ON CONFLICT. Charge only the row operation that commits.
CREATE FUNCTION private.charge_capture_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF auth.role()='authenticated' THEN PERFORM private.admit_capture_write(TG_TABLE_NAME); END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.charge_capture_write() FROM PUBLIC, anon, authenticated, service_role;

-- Deletes consume one unit per statement, allowing a single owned bulk reset.
-- RLS still filters every deleted row; a caller cannot manufacture another scope.
CREATE FUNCTION private.guard_capture_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s'
AS $$
BEGIN
    IF auth.role()='authenticated' THEN PERFORM private.admit_capture_write(TG_TABLE_NAME); END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_capture_delete() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_highlight_write BEFORE INSERT OR UPDATE ON public.user_highlights
FOR EACH ROW EXECUTE FUNCTION private.guard_capture_write();
CREATE TRIGGER guard_reflection_write BEFORE INSERT OR UPDATE ON public.user_reflections
FOR EACH ROW EXECUTE FUNCTION private.guard_capture_write();
CREATE TRIGGER guard_highlight_delete BEFORE DELETE ON public.user_highlights
FOR EACH STATEMENT EXECUTE FUNCTION private.guard_capture_delete();
CREATE TRIGGER guard_reflection_delete BEFORE DELETE ON public.user_reflections
FOR EACH STATEMENT EXECUTE FUNCTION private.guard_capture_delete();

CREATE TRIGGER charge_highlight_write AFTER INSERT OR UPDATE ON public.user_highlights
FOR EACH ROW EXECUTE FUNCTION private.charge_capture_write();
CREATE TRIGGER charge_reflection_write AFTER INSERT OR UPDATE ON public.user_reflections
FOR EACH ROW EXECUTE FUNCTION private.charge_capture_write();
