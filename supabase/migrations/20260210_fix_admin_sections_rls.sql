-- Migration: Secure homepage_section RLS policies
-- Replace generic 'authenticated' check with specific admin role check using profiles table

-- Drop existing insecure policies
DROP POLICY IF EXISTS "Admin insert" ON homepage_section;
DROP POLICY IF EXISTS "Admin update" ON homepage_section;
DROP POLICY IF EXISTS "Admin delete" ON homepage_section;

-- Create secure policies that check for admin role in profiles table
DROP POLICY IF EXISTS "Admin insert" ON homepage_section;
CREATE POLICY "Admin insert" ON homepage_section
    FOR INSERT WITH CHECK (
        exists (
            select 1 from profiles
            where profiles.id = auth.uid()
            and profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admin update" ON homepage_section;
CREATE POLICY "Admin update" ON homepage_section
    FOR UPDATE USING (
        exists (
            select 1 from profiles
            where profiles.id = auth.uid()
            and profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admin delete" ON homepage_section;
CREATE POLICY "Admin delete" ON homepage_section
    FOR DELETE USING (
        exists (
            select 1 from profiles
            where profiles.id = auth.uid()
            and profiles.role = 'admin'
        )
    );
