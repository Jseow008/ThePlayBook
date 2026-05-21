# Request Board Hardening Notes

## Completed

- Metadata fetches validate submitted URLs, DNS results, and redirects before making server-side requests.
- Request submission uses a Postgres RPC so duplicate lookup, request insert, and the initial vote happen in one transaction.
- Admin request tooling includes notification backlog monitoring for queued, aging queued, processing, stale processing, failed, and recently sent request-published emails.

## Deferred

### Parallel Email Batching

The request-published notification worker currently sends claimed emails sequentially. That is simpler and safer for launch because it keeps provider rate-limit behavior predictable and makes individual failures easy to retry.

If request cards begin collecting hundreds or thousands of voters, revisit this worker and send notifications in bounded concurrent chunks.

Potential approach:

- Keep the database claim step atomic.
- Process claimed rows with a small concurrency limit, likely 3-5 at first.
- Use `Promise.allSettled` per chunk so one provider failure does not halt the full batch.
- Tune batch size and concurrency against Resend account limits and Vercel/GitHub execution limits.

### Notification Delivery Operations

The admin request board now surfaces basic backlog counts. Future versions should extend this into a fuller delivery operations view if notification volume grows.

Potential additions:

- Show recent provider error messages grouped by cause.
- Add a manual "process now" admin action with rate limiting.
- Chart queued, sent, skipped, retried, and failed notifications over time.
- Alert when failed notifications or queued notifications older than one hour exceed a threshold.

### Vote Trigger Amplification

`content_request_votes.user_id` uses `ON DELETE CASCADE`. If a high-volume user account is deleted, Postgres will delete that user's votes and run the `content_request_vote_count_delete` row trigger once per deleted vote. This is acceptable at current scale, but future versions should revisit it if request-board voting volume becomes large.

Potential mitigations:

- Replace row-by-row cached count updates with statement-level triggers and transition tables.
- Recompute affected request vote counts in a batched account-deletion job.
- Periodically reconcile cached `vote_count` values from `content_request_votes`.
