-- Seed Data: Sample content for development
-- Creates multiple content items for a Netflix-style demo

-- ==========================================================================
-- SAMPLE CONTENT ITEM 1: Deep Work Podcast Episode
-- ==========================================================================

INSERT INTO content_item (
  id,
  type,
  title,
  source_url,
  status,
  quick_mode_json,
  duration_seconds,
  author
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'podcast',
  'Deep Work: Rules for Focused Success',
  'https://example.com/deep-work-episode',
  'verified',
  '{
    "hook": "In a world of constant distraction, the ability to perform deep work is becoming increasingly rare and valuable.",
    "big_idea": "Deep work is the ability to focus without distraction on a cognitively demanding task.",
    "key_takeaways": [
      "Schedule distraction-free blocks of at least 90 minutes",
      "Embrace boredom - resist the urge to check your phone",
      "Quit social media or strictly limit its use",
      "Drain the shallows - minimize low-value tasks"
    ]
  }',
  3600,
  'Cal Newport'
);

-- ==========================================================================
-- SAMPLE CONTENT ITEM 2: Atomic Habits
-- ==========================================================================

INSERT INTO content_item (
  id,
  type,
  title,
  source_url,
  status,
  quick_mode_json,
  duration_seconds,
  author
) VALUES (
  '11111111-1111-1111-1111-111111111112',
  'book',
  'Atomic Habits: Tiny Changes, Remarkable Results',
  'https://example.com/atomic-habits',
  'verified',
  '{
    "hook": "Small habits compound into life-changing results over time.",
    "big_idea": "The quality of our lives depends on the quality of our habits.",
    "key_takeaways": [
      "Make it obvious - design your environment for success",
      "Make it attractive - pair habits with things you enjoy",
      "Make it easy - reduce friction for good habits",
      "Make it satisfying - reward yourself immediately"
    ]
  }',
  2400,
  'James Clear'
);

-- ==========================================================================
-- SAMPLE CONTENT ITEM 3: The Tim Ferriss Show
-- ==========================================================================

INSERT INTO content_item (
  id,
  type,
  title,
  source_url,
  status,
  quick_mode_json,
  duration_seconds,
  author
) VALUES (
  '11111111-1111-1111-1111-111111111113',
  'podcast',
  'Morning Routines of Billionaires',
  'https://example.com/tim-ferriss-morning',
  'verified',
  '{
    "hook": "What separates top performers from everyone else? Their first two hours.",
    "big_idea": "A consistent morning routine eliminates decision fatigue and sets the tone for the day.",
    "key_takeaways": [
      "Wake up at the same time every day",
      "Avoid checking phone for the first hour",
      "Include movement and mindfulness",
      "Tackle your most important task first"
    ]
  }',
  5400,
  'Tim Ferriss'
);

-- ==========================================================================
-- SAMPLE CONTENT ITEM 4: The Psychology of Money
-- ==========================================================================

INSERT INTO content_item (
  id,
  type,
  title,
  source_url,
  status,
  quick_mode_json,
  duration_seconds,
  author
) VALUES (
  '11111111-1111-1111-1111-111111111114',
  'book',
  'The Psychology of Money',
  'https://example.com/psychology-money',
  'verified',
  '{
    "hook": "Financial success is not a hard science. It is a soft skill, where how you behave is more important than what you know.",
    "big_idea": "Your personal experiences with money make up maybe 0.00000001% of what has happened in the world, but maybe 80% of how you think the world works.",
    "key_takeaways": [
      "No one is crazy - everyone has different experiences",
      "Luck and risk are siblings",
      "Never enough - know when to stop",
      "Wealth is what you do not see"
    ]
  }',
  1800,
  'Morgan Housel'
);

-- ==========================================================================
-- SAMPLE CONTENT ITEM 5: Huberman Lab
-- ==========================================================================

INSERT INTO content_item (
  id,
  type,
  title,
  source_url,
  status,
  quick_mode_json,
  duration_seconds,
  author
) VALUES (
  '11111111-1111-1111-1111-111111111115',
  'podcast',
  'Optimize Your Learning and Creativity',
  'https://example.com/huberman-learning',
  'verified',
  '{
    "hook": "Your brain has specific protocols for optimal learning that most people never use.",
    "big_idea": "Neuroplasticity can be triggered at any age with the right conditions.",
    "key_takeaways": [
      "Use 90-minute learning blocks",
      "Sleep is when consolidation happens",
      "High focus states accelerate learning",
      "NSDR (non-sleep deep rest) boosts retention"
    ]
  }',
  7200,
  'Andrew Huberman'
);

-- ==========================================================================
-- SAMPLE CONTENT ITEM 6: Think Again
-- ==========================================================================

INSERT INTO content_item (
  id,
  type,
  title,
  source_url,
  status,
  quick_mode_json,
  duration_seconds,
  author
) VALUES (
  '11111111-1111-1111-1111-111111111116',
  'book',
  'Think Again: The Power of Knowing What You Do Not Know',
  'https://example.com/think-again',
  'verified',
  '{
    "hook": "Intelligence is not the ability to think and learn - it is the ability to rethink and unlearn.",
    "big_idea": "The best thinkers are constantly revising their views based on new evidence.",
    "key_takeaways": [
      "Think like a scientist - hypothesis driven",
      "Embrace being wrong as learning",
      "Argue like you are right, listen like you are wrong",
      "Build a challenge network, not just a support network"
    ]
  }',
  2700,
  'Adam Grant'
);

-- ==========================================================================
-- SAMPLE CONTENT ITEM 7: Modern Wisdom
-- ==========================================================================

INSERT INTO content_item (
  id,
  type,
  title,
  source_url,
  status,
  quick_mode_json,
  duration_seconds,
  author
) VALUES (
  '11111111-1111-1111-1111-111111111117',
  'podcast',
  'How to Build Unshakeable Confidence',
  'https://example.com/modern-wisdom-confidence',
  'verified',
  '{
    "hook": "Confidence is not about never being afraid. It is about taking action despite the fear.",
    "big_idea": "Real confidence comes from evidence - you build it by doing hard things.",
    "key_takeaways": [
      "Start with small wins and build momentum",
      "Reframe failure as data collection",
      "Your body language affects your psychology",
      "Speak to yourself like you would to a friend"
    ]
  }',
  4500,
  'Chris Williamson'
);

-- ==========================================================================
-- SAMPLE CONTENT ITEM 8: Essentialism
-- ==========================================================================

INSERT INTO content_item (
  id,
  type,
  title,
  source_url,
  status,
  quick_mode_json,
  duration_seconds,
  author
) VALUES (
  '11111111-1111-1111-1111-111111111118',
  'book',
  'Essentialism: The Disciplined Pursuit of Less',
  'https://example.com/essentialism',
  'verified',
  '{
    "hook": "If you do not prioritize your life, someone else will.",
    "big_idea": "The way of the Essentialist is the relentless pursuit of less but better.",
    "key_takeaways": [
      "Almost everything is noise - find the vital few",
      "Say no to almost everything",
      "Trade-offs are not a negative - they are a reality",
      "Create space to think and escape"
    ]
  }',
  2100,
  'Greg McKeown'
);

-- ==========================================================================
-- SAMPLE CONTENT ITEM 9: Lex Fridman Podcast
-- ==========================================================================

INSERT INTO content_item (
  id,
  type,
  title,
  source_url,
  status,
  quick_mode_json,
  duration_seconds,
  author
) VALUES (
  '11111111-1111-1111-1111-111111111119',
  'podcast',
  'The Future of AI and Human Creativity',
  'https://example.com/lex-ai-creativity',
  'verified',
  '{
    "hook": "AI will not replace humans - humans with AI will replace humans without AI.",
    "big_idea": "The intersection of human creativity and AI capabilities will define the next decade.",
    "key_takeaways": [
      "Learn to work with AI, not against it",
      "Focus on uniquely human skills - empathy, creativity",
      "AI amplifies, it does not replace",
      "The future belongs to prompt engineers and systems thinkers"
    ]
  }',
  10800,
  'Lex Fridman'
);

-- ==========================================================================
-- SAMPLE CONTENT ITEM 10: Four Thousand Weeks
-- ==========================================================================

INSERT INTO content_item (
  id,
  type,
  title,
  source_url,
  status,
  quick_mode_json,
  duration_seconds,
  author
) VALUES (
  '11111111-1111-1111-1111-111111111120',
  'book',
  'Four Thousand Weeks: Time Management for Mortals',
  'https://example.com/four-thousand-weeks',
  'verified',
  '{
    "hook": "The average human lifespan is absurdly brief - roughly 4,000 weeks.",
    "big_idea": "The problem is not that we do not have enough time, but that we have internalized impossible standards of productivity.",
    "key_takeaways": [
      "Accept that you cannot do everything",
      "Pay yourself first with time for what matters",
      "Embrace productive patience",
      "The present moment is all you ever have"
    ]
  }',
  1500,
  'Oliver Burkeman'
);

-- ==========================================================================
-- SAMPLE SEGMENTS for Deep Work (first item)
-- ==========================================================================

INSERT INTO segment (
  id,
  item_id,
  order_index,
  title,
  markdown_body,
  start_time_sec,
  end_time_sec
) VALUES (
  '22222222-2222-2222-2222-222222222221',
  '11111111-1111-1111-1111-111111111111',
  1,
  'The Deep Work Hypothesis',
  '## The Deep Work Hypothesis

In our current economy, three groups will thrive:

1. **High-skilled workers** who can work with intelligent machines
2. **Superstars** who are the best at what they do
3. **Owners** who have access to capital

What do the first two groups have in common? They require the ability to quickly master hard things and produce at an elite level.

> "Deep work is so important that we might consider it the superpower of the 21st century."

The core abilities for thriving in the new economy depend on your ability to perform **deep work**.',
  0,
  900
);

INSERT INTO segment (
  id,
  item_id,
  order_index,
  title,
  markdown_body,
  start_time_sec,
  end_time_sec
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  2,
  'Deep Work Strategies',
  '## Four Strategies for Deep Work

### 1. The Monastic Philosophy
Eliminate or radically minimize shallow obligations.

### 2. The Bimodal Philosophy
Divide your time into deep and shallow blocks.

### 3. The Rhythmic Philosophy
Create a daily ritual at the same time every day.

### 4. The Journalistic Philosophy
Fit deep work wherever you can into your schedule.',
  901,
  2100
);

INSERT INTO segment (
  id,
  item_id,
  order_index,
  title,
  markdown_body,
  start_time_sec,
  end_time_sec
) VALUES (
  '22222222-2222-2222-2222-222222222223',
  '11111111-1111-1111-1111-111111111111',
  3,
  'Putting It Into Practice',
  '## Immediate Action Steps

1. **Schedule your deep work blocks** - Block 2-4 hours on your calendar
2. **Create a shutdown ritual** - Review tasks and say "Shutdown complete"
3. **Embrace productive meditation** - Use physical activity for focused thinking
4. **Structure your shallow work** - Batch emails to 2-3 times per day',
  2101,
  3600
);

-- ==========================================================================
-- SAMPLE ARTIFACT: Deep Work Checklist
-- ==========================================================================

INSERT INTO artifact (
  id,
  item_id,
  type,
  payload_schema,
  version
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'checklist',
  '{
    "title": "Deep Work Daily Protocol",
    "items": [
      {"id": "task_01", "label": "Block 2+ hours for deep work on calendar", "mandatory": true},
      {"id": "task_02", "label": "Turn off all notifications during deep work", "mandatory": true},
      {"id": "task_03", "label": "Define the specific outcome for this session", "mandatory": true},
      {"id": "task_04", "label": "Have water and necessities ready before starting", "mandatory": false},
      {"id": "task_05", "label": "Complete shutdown ritual at end of day", "mandatory": false}
    ]
  }',
  1
);
