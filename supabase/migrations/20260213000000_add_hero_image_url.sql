-- Reconciliation-only capture of the landscape image field introduced in the
-- application on 2026-02-13 and applied directly to production.
ALTER TABLE public.content_item
ADD COLUMN IF NOT EXISTS hero_image_url text;
