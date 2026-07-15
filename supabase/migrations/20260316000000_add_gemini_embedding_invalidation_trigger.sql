-- Reconciliation-only capture of a trigger that exists in production but was
-- not represented in the repository migration sequence.
CREATE OR REPLACE FUNCTION public.invalidate_gemini_segment_embedding_on_body_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF BTRIM(OLD.markdown_body) IS DISTINCT FROM BTRIM(NEW.markdown_body) THEN
        DELETE FROM public.segment_embedding_gemini
        WHERE segment_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER invalidate_gemini_segment_embedding_on_body_change
AFTER UPDATE OF markdown_body ON public.segment
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_gemini_segment_embedding_on_body_change();
