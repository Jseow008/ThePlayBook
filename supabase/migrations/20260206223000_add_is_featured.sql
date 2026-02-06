-- Add is_featured column to content_item table
ALTER TABLE "public"."content_item" 
ADD COLUMN "is_featured" boolean NOT NULL DEFAULT false;

-- Comment on column
COMMENT ON COLUMN "public"."content_item"."is_featured" IS 'Whether to show this item in the homepage hero carousel';
