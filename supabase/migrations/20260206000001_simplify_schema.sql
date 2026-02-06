-- Migration: Simplify Schema for Public-First Architecture
-- Adds content categorization (user_item_state was removed in a previous cleanup)

-- ==========================================================================
-- ADD CATEGORY COLUMN TO CONTENT_ITEM
-- ==========================================================================

-- Add category column for organizing content into Netflix-style rows
ALTER TABLE content_item ADD COLUMN IF NOT EXISTS category TEXT;

-- Add index for category queries
CREATE INDEX IF NOT EXISTS idx_content_item_category ON content_item(category) WHERE deleted_at IS NULL;

-- ==========================================================================
-- UPDATE EXISTING CONTENT WITH CATEGORIES
-- ==========================================================================

-- Productivity category
UPDATE content_item SET category = 'Productivity' 
WHERE title IN (
    'Deep Work: Rules for Focused Success',
    'Atomic Habits: Tiny Changes, Remarkable Results',
    'Essentialism: The Disciplined Pursuit of Less',
    'Four Thousand Weeks: Time Management for Mortals'
);

-- Mindset category
UPDATE content_item SET category = 'Mindset'
WHERE title IN (
    'Think Again: The Power of Knowing What You Do Not Know',
    'How to Build Unshakeable Confidence'
);

-- Science & Learning category
UPDATE content_item SET category = 'Science & Learning'
WHERE title IN (
    'Optimize Your Learning and Creativity',
    'The Future of AI and Human Creativity'
);

-- Money & Finance category
UPDATE content_item SET category = 'Money & Finance'
WHERE title = 'The Psychology of Money';

-- Lifestyle category
UPDATE content_item SET category = 'Lifestyle'
WHERE title = 'Morning Routines of Billionaires';
