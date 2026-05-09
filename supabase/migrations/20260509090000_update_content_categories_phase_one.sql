-- Phase 1 category taxonomy migration.
-- Rewrites existing data to canonical category labels while the app keeps
-- temporary search aliases for old public category URLs.

WITH category_aliases(old_category, new_category) AS (
    VALUES
        ('Christian', 'Religion & Spirituality'),
        ('Finance', 'Money & Investments'),
        ('Health', 'Health & Nutrition'),
        ('Mindset', 'Personal Development'),
        ('Money & Finance', 'Money & Investments'),
        ('Parenthood', 'Parenting'),
        ('Pregnancy', 'Parenting'),
        ('Science & Learning', 'Science'),
        ('Technology', 'Technology & the Future'),
        ('Wealth', 'Money & Investments')
)
UPDATE public.content_item AS content
SET category = category_aliases.new_category
FROM category_aliases
WHERE content.category = category_aliases.old_category;

WITH category_aliases(old_category, new_category) AS (
    VALUES
        ('Christian', 'Religion & Spirituality'),
        ('Finance', 'Money & Investments'),
        ('Health', 'Health & Nutrition'),
        ('Mindset', 'Personal Development'),
        ('Money & Finance', 'Money & Investments'),
        ('Parenthood', 'Parenting'),
        ('Pregnancy', 'Parenting'),
        ('Science & Learning', 'Science'),
        ('Technology', 'Technology & the Future'),
        ('Wealth', 'Money & Investments')
)
UPDATE public.homepage_section AS section
SET filter_value = category_aliases.new_category,
    updated_at = NOW()
FROM category_aliases
WHERE section.filter_type = 'category'
  AND section.filter_value = category_aliases.old_category;
