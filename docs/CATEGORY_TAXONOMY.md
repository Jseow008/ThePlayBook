# Category Taxonomy

Status: The 18-topic taxonomy is the current catalog model.

Netflux uses canonical category labels for content rows, admin publishing, search, and landing-page topic links. Categories are intentionally broad because the product promise is knowledge without limits or rigid domain boundaries. Categories are still stored as text in `content_item.category`; the app-level canonical source is `lib/content-categories.ts`.

## Search and publishing

The topic list in `lib/content-categories.ts` supplies all 18 Search options and the admin publishing form. Search shows six shortcuts plus **More topics** on desktop and the complete alphabetical list on narrow screens.

Retired category URLs return to **All topics**, preserving the search text, type and applicable sort. Search resets the result page and cursor when it drops the retired filter. Preview and Read links use the summary identity and are unaffected.

## Production data

The production category-only update reclassified 343 records in place, preserving publication and deletion status. Read-only checks after the update found 507 published summaries across 18 topics, including 21 under Christianity. The superseded edition of *Endure* retains its historical Science category and is excluded from the public catalog.

The earlier Phase 1 migration remains part of the migration history. Legacy normalization for historical rows used by existing catalog helpers does not add choices to Search.
