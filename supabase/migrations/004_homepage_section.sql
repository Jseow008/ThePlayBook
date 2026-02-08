-- Migration: Create homepage_section table for admin-controlled homepage lanes
-- Run this in your Supabase SQL Editor

CREATE TABLE homepage_section (
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
CREATE POLICY "Public read" ON homepage_section 
    FOR SELECT USING (true);

-- Allow authenticated users to manage sections (admin)
CREATE POLICY "Admin insert" ON homepage_section 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin update" ON homepage_section 
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admin delete" ON homepage_section 
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create index for ordering
CREATE INDEX idx_homepage_section_order ON homepage_section(order_index);

-- Insert default sections (optional - comment out if you want to start empty)
INSERT INTO homepage_section (title, filter_type, filter_value, order_index, is_active) VALUES
    ('Diary of a CEO', 'author', 'Steven Bartlett', 1, true),
    ('TED Talks', 'title', 'TED', 2, true);
