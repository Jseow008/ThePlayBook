-- Migration 001: Content Layer
-- Creates the core content tables: content_item, segment, artifact

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================================================
-- ENUMS
-- ==========================================================================

CREATE TYPE content_status AS ENUM ('draft', 'verified');
CREATE TYPE content_type AS ENUM ('podcast', 'book', 'article');
CREATE TYPE artifact_type AS ENUM ('checklist', 'plan', 'script');

-- ==========================================================================
-- CONTENT_ITEM TABLE
-- Main content entity (podcast episodes, book chapters, articles)
-- ==========================================================================

CREATE TABLE content_item (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type content_type NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  status content_status NOT NULL DEFAULT 'draft',
  
  -- Quick Mode JSON (hook, big_idea, key_takeaways)
  quick_mode_json JSONB,
  
  -- Metadata
  duration_seconds INTEGER,
  author TEXT,
  cover_image_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ -- Soft delete
);

-- Index for common queries
CREATE INDEX idx_content_item_status ON content_item(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_content_item_type ON content_item(type) WHERE deleted_at IS NULL;

-- ==========================================================================
-- SEGMENT TABLE
-- Content segments (chapters, sections) with markdown body
-- ==========================================================================

CREATE TABLE segment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  title TEXT,
  
  -- Content
  markdown_body TEXT NOT NULL,
  
  -- For audio/video content
  start_time_sec INTEGER,
  end_time_sec INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ, -- Soft delete
  
  -- Constraint: unique order per item
  UNIQUE (item_id, order_index)
);

-- Index for fetching segments by item
CREATE INDEX idx_segment_item_id ON segment(item_id) WHERE deleted_at IS NULL;

-- ==========================================================================
-- ARTIFACT TABLE
-- Interactive utilities (checklists, plans, scripts)
-- ==========================================================================

CREATE TABLE artifact (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  type artifact_type NOT NULL,
  
  -- JSON payload following type-specific schema
  payload_schema JSONB NOT NULL,
  
  -- Versioning for schema evolution
  version TEXT NOT NULL DEFAULT '1.0.0',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching artifacts by item
CREATE INDEX idx_artifact_item_id ON artifact(item_id);

-- ==========================================================================
-- UPDATED_AT TRIGGER
-- Automatically update updated_at timestamp
-- ==========================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_content_item_updated_at
  BEFORE UPDATE ON content_item
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_segment_updated_at
  BEFORE UPDATE ON segment
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_artifact_updated_at
  BEFORE UPDATE ON artifact
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
