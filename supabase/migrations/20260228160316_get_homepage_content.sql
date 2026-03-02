-- Migration: Create RPC for getting homepage sections and their content
-- This replaces the N+1 queries on the HomeFeedServer

DROP FUNCTION IF EXISTS get_homepage_sections_with_items(integer);

CREATE OR REPLACE FUNCTION get_homepage_sections_with_items(
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  section_id UUID,
  section_title TEXT,
  filter_type_out TEXT,
  filter_value_out TEXT,
  order_index_out INT,
  is_active_out BOOLEAN,
  items JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_section RECORD;
  v_items JSONB;
BEGIN
  FOR v_section IN (SELECT id, title, filter_type, filter_value, order_index, is_active FROM homepage_section WHERE is_active = true ORDER BY order_index) LOOP
    IF v_section.filter_type = 'author' THEN
      SELECT jsonb_agg(t) INTO v_items FROM (
        SELECT id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, hero_image_url, category, is_featured, audio_url, created_at, updated_at, deleted_at
        FROM content_item
        WHERE status = 'verified' AND deleted_at IS NULL AND author ILIKE '%' || v_section.filter_value || '%'
        ORDER BY created_at DESC LIMIT p_limit
      ) t;
    ELSIF v_section.filter_type = 'title' THEN
      SELECT jsonb_agg(t) INTO v_items FROM (
        SELECT id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, hero_image_url, category, is_featured, audio_url, created_at, updated_at, deleted_at
        FROM content_item
        WHERE status = 'verified' AND deleted_at IS NULL AND title ILIKE '%' || v_section.filter_value || '%'
        ORDER BY created_at DESC LIMIT p_limit
      ) t;
    ELSIF v_section.filter_type = 'category' THEN
      SELECT jsonb_agg(t) INTO v_items FROM (
        SELECT id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, hero_image_url, category, is_featured, audio_url, created_at, updated_at, deleted_at
        FROM content_item
        WHERE status = 'verified' AND deleted_at IS NULL AND category = v_section.filter_value
        ORDER BY created_at DESC LIMIT p_limit
      ) t;
    ELSIF v_section.filter_type = 'featured' THEN
      SELECT jsonb_agg(t) INTO v_items FROM (
        SELECT id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, hero_image_url, category, is_featured, audio_url, created_at, updated_at, deleted_at
        FROM content_item
        WHERE status = 'verified' AND deleted_at IS NULL AND is_featured = true
        ORDER BY created_at DESC LIMIT p_limit
      ) t;
    ELSE
      -- Default: just latest
      SELECT jsonb_agg(t) INTO v_items FROM (
        SELECT id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, hero_image_url, category, is_featured, audio_url, created_at, updated_at, deleted_at
        FROM content_item
        WHERE status = 'verified' AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT p_limit
      ) t;
    END IF;

    section_id := v_section.id;
    section_title := v_section.title;
    filter_type_out := v_section.filter_type;
    filter_value_out := v_section.filter_value;
    order_index_out := v_section.order_index;
    is_active_out := v_section.is_active;
    items := COALESCE(v_items, '[]'::jsonb);
    RETURN NEXT;
  END LOOP;
END;
$$;
