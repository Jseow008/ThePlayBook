-- Deterministic content for local development and CI browser tests.
-- Supabase applies this file during local start/reset; it is not a production migration.

BEGIN;

INSERT INTO public.content_item (
  id,
  type,
  title,
  status,
  quick_mode_json,
  duration_seconds,
  author,
  category,
  is_featured
)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'book',
  'The Netflux CI Reading Fixture',
  'verified',
  jsonb_build_object(
    'hook', 'A stable local fixture keeps the public reading journey testable.',
    'big_idea', 'Deterministic test data makes browser checks independent of production content.',
    'key_takeaways', jsonb_build_array(
      'Use local-only seed data for browser tests.',
      'Keep production data outside the CI dependency chain.'
    )
  ),
  600,
  'Netflux',
  'Productivity',
  true
)
ON CONFLICT (id) DO UPDATE
SET
  type = EXCLUDED.type,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  quick_mode_json = EXCLUDED.quick_mode_json,
  duration_seconds = EXCLUDED.duration_seconds,
  author = EXCLUDED.author,
  category = EXCLUDED.category,
  is_featured = EXCLUDED.is_featured,
  deleted_at = NULL;

INSERT INTO public.segment (
  id,
  item_id,
  order_index,
  title,
  markdown_body
)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  0,
  'A Reliable First Section',
  E'## A Reliable First Section\n\nThis deterministic segment verifies the public browse, preview, and reader flow without relying on production data.'
)
ON CONFLICT (id) DO UPDATE
SET
  item_id = EXCLUDED.item_id,
  order_index = EXCLUDED.order_index,
  title = EXCLUDED.title,
  markdown_body = EXCLUDED.markdown_body,
  deleted_at = NULL;

COMMIT;
