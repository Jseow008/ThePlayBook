-- Migration: update insert_generated_content to accept category

CREATE OR REPLACE FUNCTION public.insert_generated_content(
  p_title text, 
  p_type content_type, 
  p_author text DEFAULT NULL::text, 
  p_category text DEFAULT NULL::text,
  p_status content_status DEFAULT 'draft'::content_status, 
  p_quick_mode_json jsonb DEFAULT '{}'::jsonb, 
  p_segments jsonb DEFAULT '[]'::jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_content_id uuid;
  v_segment jsonb;
  v_index int := 0;
BEGIN
  -- Insert the content_item
  INSERT INTO content_item (title, type, author, category, status, quick_mode_json)
  VALUES (p_title, p_type, p_author, p_category, p_status, p_quick_mode_json)
  RETURNING id INTO v_content_id;

  -- Insert segments
  FOR v_segment IN SELECT * FROM jsonb_array_elements(p_segments)
  LOOP
    INSERT INTO segment (item_id, order_index, title, markdown_body)
    VALUES (
      v_content_id,
      v_index,
      v_segment->>'title',
      v_segment->>'content'
    );
    v_index := v_index + 1;
  END LOOP;

  RETURN v_content_id;
END;
$function$
