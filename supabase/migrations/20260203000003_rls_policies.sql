-- Migration 003: Row Level Security (RLS) Policies
-- Implements security policies for public content access

-- ==========================================================================
-- ENABLE RLS ON ALL TABLES
-- ==========================================================================

ALTER TABLE content_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- CONTENT_ITEM POLICIES
-- ==========================================================================

-- Policy A: Public Read - Anyone can read verified, non-deleted content
CREATE POLICY "Public can read verified content"
  ON content_item
  FOR SELECT
  USING (status = 'verified' AND deleted_at IS NULL);

-- Policy C: Admin Write - Service role can do anything
CREATE POLICY "Service role has full access to content_item"
  ON content_item
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==========================================================================
-- SEGMENT POLICIES
-- ==========================================================================

-- Policy A: Public Read - Anyone can read segments of verified items
CREATE POLICY "Public can read segments of verified content"
  ON segment
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM content_item
      WHERE content_item.id = segment.item_id
        AND content_item.status = 'verified'
        AND content_item.deleted_at IS NULL
    )
  );

-- Policy C: Admin Write
CREATE POLICY "Service role has full access to segment"
  ON segment
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==========================================================================
-- ARTIFACT POLICIES
-- ==========================================================================

-- Policy: Read artifacts of verified content
CREATE POLICY "Public can read artifacts of verified content"
  ON artifact
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM content_item
      WHERE content_item.id = artifact.item_id
        AND content_item.status = 'verified'
        AND content_item.deleted_at IS NULL
    )
  );

-- Policy C: Admin Write
CREATE POLICY "Service role has full access to artifact"
  ON artifact
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
