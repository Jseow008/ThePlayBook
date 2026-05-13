# Category Taxonomy

Status: Phase 1 migration active.

Netflux uses canonical category labels for content rows, admin publishing, search, and landing-page topic links. Categories are intentionally broad because the product promise is knowledge without limits or rigid domain boundaries. Categories are still stored as text in `content_item.category`; the app-level canonical source is `lib/content-categories.ts`.

## Canonical Renames

- `Mindset` -> `Personal Development`
- `Finance` + `Wealth` + `Money & Finance` -> `Money & Investments`
- `Technology` -> `Technology & the Future`
- `Health` -> `Health & Nutrition`
- `Parenthood` + `Pregnancy` -> `Parenting`
- `Christian` -> `Religion & Spirituality`
- `Science & Learning` -> `Science`
- `Psychology` remains `Psychology`

## Phase 1 Compatibility

The migration `20260509090000_update_content_categories_phase_one.sql` updates Supabase content rows and category-based homepage section filters to canonical labels.

Temporary search aliases remain in `CONTENT_CATEGORY_ALIASES` so old public URLs such as `/search?category=Mindset` and `/search?category=Christian` redirect to their canonical equivalents.

## Phase 2 Cleanup

After a few weeks, or once analytics/logs show no meaningful traffic to old category URLs:

1. Remove `CONTENT_CATEGORY_ALIASES` and alias resolution helpers from `lib/content-categories.ts`.
2. Remove the alias redirect branch from `app/(public)/search/page.tsx`.
3. Remove alias-specific search tests.
4. Keep only canonical labels in docs, admin options, landing topics, and search topics.
