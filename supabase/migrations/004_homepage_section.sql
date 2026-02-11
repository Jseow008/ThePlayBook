
-- Migration: Create homepage_section table for admin-controlled homepage lanes
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS homepage_section (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    filter_type TEXT NOT NULL CHECK (filter_type IN ('author', 'category', 'title', 'featured')),
    filter_value TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE homepage_section ENABLE ROW LEVEL SECURITY;

-- Allow public read access (homepage needs to fetch sections)
DROP POLICY IF EXISTS "Public read" ON homepage_section;
CREATE POLICY "Public read" ON homepage_section 
    FOR SELECT USING (true);

-- Allow authenticated users to manage sections (admin)
DROP POLICY IF EXISTS "Admin insert" ON homepage_section;
CREATE POLICY "Admin insert" ON homepage_section 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin update" ON homepage_section;
CREATE POLICY "Admin update" ON homepage_section 
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin delete" ON homepage_section;
CREATE POLICY "Admin delete" ON homepage_section 
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_homepage_section_order ON homepage_section(order_index);

-- Insert default sections (optional - comment out if you want to start empty)
-- Using DO block to handle conditional insert without unique constraint on title
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM homepage_section WHERE title = 'Diary of a CEO') THEN
        INSERT INTO homepage_section (title, filter_type, filter_value, order_index, is_active)
        VALUES ('Diary of a CEO', 'author', 'Steven Bartlett', 1, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM homepage_section WHERE title = 'TED Talks') THEN
        INSERT INTO homepage_section (title, filter_type, filter_value, order_index, is_active)
        VALUES ('TED Talks', 'title', 'TED', 2, true);
    END IF;
END $$;
