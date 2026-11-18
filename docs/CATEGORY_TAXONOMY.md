# Category Taxonomy

Status: The approved catalog model has 19 topics. Production data matches the mapping; the application rollout is pending required PR checks.

Netflux uses canonical category labels for content rows, admin publishing, search, and landing-page topic links. Categories are intentionally broad because the product promise is knowledge without limits or rigid domain boundaries. Categories are still stored as text in `content_item.category`; the app-level canonical source is `lib/content-categories.ts`.

## Search and publishing

The topic list in `lib/content-categories.ts` supplies all 19 Search options and the admin publishing form. Christianity and Religion & Spirituality are separate categories. The historical Christian alias resolves to Christianity. Search shows six shortcuts plus **More topics** on desktop and the complete alphabetical list on narrow screens.

Retired category URLs return to **All topics**, preserving the search text, type and applicable sort. Search resets the result page and cursor when it drops the retired filter. Preview and Read links use the summary identity and are unaffected.

## Production data

The earlier production category-only update reclassified 343 records in place, preserving publication and deletion status. Read-only checks after that update found 507 published summaries across 18 topics, including 21 under Christianity. The superseded edition of *Endure* retains its historical Science category and is excluded from the public catalog.

The approved 18 November mapping covers 522 published summaries, comprising 375 books and 147 podcasts. `scripts/approved-category-mapping-20261118.sql` applies the 20 remaining category changes in a single transaction. It checks each record's identity, publication state, and previous or already-applied target category, preserves all content fields except category and its update timestamp, and validates the exact final published totals. A mismatch rolls back the transaction. Re-running an applied plan updates no records.

This is a data-only operation with no schema migration or migration-history change. The owner explicitly accepted the hosted-verification exception and exact production transaction in PR #383 before it ran, under `docs/OPS.md` section 2.2. On 18 November the 20 updates committed, and independent reads verified all 522 assignments, every category total, and unchanged protected metadata on all 20 affected records. Security-policy PR #385 resolved the disputed dependency-audit blocker with a scoped exception expiring 2 December 2026. The application rollout remains gated by PR #383 required checks.

Religion & Spirituality contains *The Power of Now*, *The Untethered Soul*, and *The Four Agreements*. Christianity contains the existing 19 books and 2 podcasts. Historical category fields inside summary JSON remain source metadata; `content_item.category` is the current category.

| Category | Books | Podcasts | Total |
| --- | ---: | ---: | ---: |
| Business | 50 | 22 | 72 |
| Personal Development | 38 | 19 | 57 |
| Psychology | 43 | 11 | 54 |
| Health & Fitness | 13 | 30 | 43 |
| Money & Investments | 33 | 8 | 41 |
| Economics | 28 | 3 | 31 |
| Politics & Society | 18 | 13 | 31 |
| Science & Environment | 23 | 9 | 32 |
| Technology & the Future | 17 | 8 | 25 |
| Philosophy | 18 | 3 | 21 |
| Productivity | 15 | 4 | 19 |
| Religion & Spirituality | 3 | 0 | 3 |
| Relationships & Communication | 14 | 7 | 21 |
| Careers & Work | 13 | 1 | 14 |
| Biography & Memoir | 10 | 0 | 10 |
| Management & Leadership | 6 | 4 | 10 |
| History | 8 | 1 | 9 |
| Learning & Creativity | 6 | 2 | 8 |
| Christianity | 19 | 2 | 21 |
| Total | 375 | 147 | 522 |

The earlier Phase 1 migration remains part of the migration history. Legacy normalization for historical rows used by existing catalog helpers does not add choices to Search.
