-- Approved 19-category mapping, reviewed 18 November 2026.
-- Data-only operation: no schema migration or migration-history change.
-- Apply only after the exact production plan and release exception are approved.
-- Retries accept already-applied target categories and update only pending rows.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE approved_categories (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    author text NOT NULL,
    type text NOT NULL,
    previous_category text NOT NULL,
    category text NOT NULL
) ON COMMIT DROP;

INSERT INTO approved_categories VALUES
    ('0a0eb25d-3b2f-4c90-99c2-fc789edd1f57', 'The Untethered Soul', 'Michael A. Singer', 'book', 'Philosophy', 'Religion & Spirituality'),
    ('0fb73a47-446b-4e59-b664-72cf13984bb0', 'The 48 Laws of Power', 'Robert Greene', 'book', 'Psychology', 'Relationships & Communication'),
    ('1816ef4e-4b5b-4557-b74a-e213b468ebfc', 'The Power of Now', 'Eckhart Tolle', 'book', 'Philosophy', 'Religion & Spirituality'),
    ('2565d56b-07fc-455c-9aba-bf11e9c6996f', 'The Courage of Vulnerability in a Disconnected World', 'Steven Bartlett with Brene Brown', 'podcast', 'Personal Development', 'Relationships & Communication'),
    ('2f1381ef-403a-4a09-a169-7fa5362f5f9e', 'Predictably Irrational', 'Dan Ariely', 'book', 'Economics', 'Psychology'),
    ('48d29b28-c08e-42fd-9c1f-fab4de64ba8a', 'Building Agency and Confidence Through Compassionate Self-Examination', 'Andrew Huberman with Dr. Paul Conti', 'podcast', 'Psychology', 'Personal Development'),
    ('4912a378-e514-462d-a8a4-39e79477f503', 'The Realities of Power, Teamwork, and Lifelong Learning', 'Shane Parrish with Michael Ovitz', 'podcast', 'Business', 'Management & Leadership'),
    ('4a6d83dd-7516-4a3a-b9d4-edb1011c891a', 'Bubbles, Inequality, and Fertility Risks', 'Steven Bartlett with Jeremy Grantham', 'podcast', 'Economics', 'Money & Investments'),
    ('4d6f13d3-f231-4205-bb97-08dd52174797', 'The Four Agreements', 'Don Miguel Ruiz', 'book', 'Philosophy', 'Religion & Spirituality'),
    ('50996c7e-90ee-4942-a46e-d5da5d8fa512', 'Humor, Obsession, and Navigating a Fractured Modern Society', 'Chris Williamson with Jimmy Carr', 'podcast', 'Politics & Society', 'Personal Development'),
    ('57bdc55d-5a52-4b62-9eda-e133acf661e6', 'Unlocking Your Brain''s Potential and Improving Your Memory Capacity', 'Steven Bartlett with Jim Kwik', 'podcast', 'Personal Development', 'Learning & Creativity'),
    ('621aa8b6-589b-4683-a69f-9bb7ad94b62c', 'Biological Protocols for Optimizing Energy, Stress Resilience, and Focus', 'Chris Williamson with Dr Andrew Huberman', 'podcast', 'Personal Development', 'Health & Fitness'),
    ('71caedfc-09a0-43bf-9624-1c8d24e6ef46', 'Finding an Audience Without a Formula', 'Chris Williamson with Dylan Gossett', 'podcast', 'Career & Success', 'Careers & Work'),
    ('7d9c70aa-9ff3-4967-a1c7-0837e1261b93', 'Addiction, Power Dynamics, and Finding Freedom Under Global Scrutiny', 'Chris Williamson with Matt McCusker, Duncan Trussell, and Hunter Biden', 'podcast', 'Politics & Society', 'Personal Development'),
    ('a0ccfe87-0cdf-41bf-8931-9c25fe900dd1', 'The Value of Human Struggle in the Age of AI', 'Steven Bartlett with Simon Sinek', 'podcast', 'Technology & the Future', 'Philosophy'),
    ('afa32bb5-6ff4-4e9f-8c22-31af62c424c2', 'Body Language Expert', 'Steven Bartlett with Chase Hughes', 'podcast', 'Psychology', 'Relationships & Communication'),
    ('b8a23288-792e-4521-8f2f-c19ca6d1a47a', 'Reversing Aging: The Science of Living Younger and Longer', 'Steven Bartlett with Dr David Sinclair', 'podcast', 'Health & Fitness', 'Science & Environment'),
    ('d229c2d8-438c-4bc2-96f1-3348a10f300e', 'The Sovereign Individual', 'James Dale Davidson and William Rees-Mogg', 'book', 'Politics & Society', 'Technology & the Future'),
    ('d737b8a6-4062-4f83-8e1b-700512ba22c8', 'Secret Agent Insights', 'Steven Bartlett with Evy Poumpouras', 'podcast', 'Personal Development', 'Relationships & Communication'),
    ('effebabb-1547-452e-b871-79d3538a2ccc', 'Navigating the AI Bubble and the Changing World Order', 'Steven Bartlett with Ray Dalio', 'podcast', 'Technology & the Future', 'Economics');

DO $$
BEGIN
    PERFORM ci.id FROM public.content_item ci
        JOIN pg_temp.approved_categories m ON m.id = ci.id
        ORDER BY ci.id FOR UPDATE OF ci;

    IF EXISTS (
        SELECT 1 FROM pg_temp.approved_categories m
        LEFT JOIN public.content_item ci ON ci.id = m.id
        WHERE ci.id IS NULL OR ci.title IS DISTINCT FROM m.title
            OR ci.author IS DISTINCT FROM m.author OR ci.type::text IS DISTINCT FROM m.type
            OR ci.status::text <> 'verified' OR ci.deleted_at IS NOT NULL
            OR ci.category IS NULL OR ci.category NOT IN (m.previous_category, m.category)
    ) THEN
        RAISE EXCEPTION 'Category mapping drift: re-review the production plan before applying';
    END IF;
END;
$$;

CREATE TEMP TABLE category_metadata_before ON COMMIT DROP AS
SELECT ci.id, to_jsonb(ci) - ARRAY['category', 'updated_at'] AS untouched
FROM public.content_item ci JOIN pg_temp.approved_categories m ON m.id = ci.id;

UPDATE public.content_item ci SET category = m.category
FROM pg_temp.approved_categories m
WHERE ci.id = m.id AND ci.category IS DISTINCT FROM m.category
RETURNING ci.id, ci.title, ci.category;

CREATE TEMP TABLE category_expected_totals (category text PRIMARY KEY, count bigint NOT NULL) ON COMMIT DROP;
INSERT INTO category_expected_totals VALUES
    ('Business', 72),
    ('Personal Development', 57),
    ('Psychology', 54),
    ('Health & Fitness', 43),
    ('Money & Investments', 41),
    ('Economics', 31),
    ('Politics & Society', 31),
    ('Science & Environment', 32),
    ('Technology & the Future', 25),
    ('Philosophy', 21),
    ('Productivity', 19),
    ('Religion & Spirituality', 3),
    ('Relationships & Communication', 21),
    ('Careers & Work', 14),
    ('Biography & Memoir', 10),
    ('Management & Leadership', 10),
    ('History', 9),
    ('Learning & Creativity', 8),
    ('Christianity', 21);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_temp.category_metadata_before b
        JOIN public.content_item ci ON ci.id = b.id
        WHERE b.untouched IS DISTINCT FROM (to_jsonb(ci) - ARRAY['category', 'updated_at'])
    ) THEN
        RAISE EXCEPTION 'Category-only update changed protected content metadata';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_temp.approved_categories m
        JOIN public.content_item ci ON ci.id = m.id WHERE ci.category IS DISTINCT FROM m.category
    ) THEN
        RAISE EXCEPTION 'Approved category assignment was not applied';
    END IF;

    IF EXISTS (
        WITH actual AS (
            SELECT category, count(*) AS count FROM public.content_item
            WHERE status::text = 'verified' AND deleted_at IS NULL GROUP BY category
        )
        SELECT 1 FROM actual a FULL JOIN pg_temp.category_expected_totals e USING (category)
        WHERE a.category IS NULL OR e.category IS NULL OR a.count IS DISTINCT FROM e.count
    ) THEN
        RAISE EXCEPTION 'Published category totals differ from the approved 522-item plan';
    END IF;
END;
$$;

SELECT category, count(*) AS count FROM public.content_item
WHERE status::text = 'verified' AND deleted_at IS NULL GROUP BY category ORDER BY category;
COMMIT;
