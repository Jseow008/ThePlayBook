# Request Board Hardening Notes

## Completed

- Metadata fetches validate submitted URLs, DNS results, and redirects before making server-side requests.
- Request submission uses a Postgres RPC so duplicate lookup, request insert, and the initial vote happen in one transaction.

## Deferred

### Vote Trigger Amplification

`content_request_votes.user_id` uses `ON DELETE CASCADE`. If a high-volume user account is deleted, Postgres will delete that user's votes and run the `content_request_vote_count_delete` row trigger once per deleted vote. This is acceptable at current scale, but future versions should revisit it if request-board voting volume becomes large.

Potential mitigations:

- Replace row-by-row cached count updates with statement-level triggers and transition tables.
- Recompute affected request vote counts in a batched account-deletion job.
- Periodically reconcile cached `vote_count` values from `content_request_votes`.
