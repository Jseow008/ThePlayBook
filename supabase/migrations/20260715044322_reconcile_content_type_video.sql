-- Production already accepts video content, but the historical repository
-- migrations only create podcast, book, and article enum labels. Preserve the
-- live contract on clean replay without changing existing production rows.
ALTER TYPE public.content_type ADD VALUE IF NOT EXISTS 'video';
