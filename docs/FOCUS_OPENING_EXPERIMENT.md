# Focus opening-card experiment

**Status:** pre-registered trial contract (5 October 2026). This document sets the comparison before production results exist.

## Change and assignment

- A browser receives a persistent 50/50 `control` or `ranked` assignment in local storage. If storage is unavailable, it uses control. Assignment is stable on that browser; cross-device identity is not assumed.
- Both groups use the same six-card Focus response, candidate selection, cover priority, and analytics. Control shuffles all six cards as before. Ranked keeps the server's first selected candidate in position one and shuffles the other five.
- The ranked order applies only to the first **fresh** successful batch. Restored cards and reading position remain untouched. Later batches use the existing shuffle in both groups.
- A library that has not loaded produces an immediate discovery opening. The active opening card remains visible when library state arrives, even if it turns out to be completed; normal filtering resumes after the user moves on. This safeguard applies to both groups. `personalization_ready` distinguishes these visits.
- The server returns the selected order and IDs of personalized cards in the existing POST response. No additional recommendation or image request is part of the trial. Legacy GET keeps its existing ID order and response shape.

## Event definitions

`focus_visit_started` records assignment, whether storage made the assignment stable, fresh/restored entry, library readiness, and mobile/desktop class. Exclude storage-restricted control fallbacks from the comparison. `focus_card_impression` fires once per card per Focus visit only after at least 75% of the card is visible for 500 ms in a foreground tab. React rerenders do not count a second impression; a separate restored visit is analyzed separately. `focus_card_action` records confirmed summary rendering, successful save, and rapid movement past an impressed card within 2.5 seconds. A rapid skip is a supporting signal, never a dislike label.

`focus_feed_timing` measures from Focus component mount to the first readable card (at 75% visibility), and to the first cover's completed 150 ms opacity transition. Cached images follow the same load path. Final image failure and cards without covers are separate outcomes. `end_wait` records only when a user reaches the last available card before the next card is ready; a failed fetch is marked separately. Card actions remain available while covers load.

Events contain a random, visit-scoped ID, a content ID where relevant, and bounded metadata. They do not include reading-history IDs, card text, image URLs, or raw user input. The visit ID joins impressions to actions without sending the user's library. Focus loads analytics after rendering through a separate import and never waits for delivery.

## Evaluation and stopping rule

- **Primary outcome:** among foreground first-card impressions on fresh visits, the share with a confirmed summary open or successful save of that first card from the same visit. Count the first qualifying action once per visit. Analyze `personalization_ready` and first-card source separately; do not pool a discovery-only opening with a personalized one to make a claim about relevance.
- **Supporting outcomes:** visit-to-impression rate (immediate exit signal), rapid-skip rate, later-card impressions and useful actions, and the rate of `end_wait` events. Review mobile and desktop separately. Restored visits are a separate stability cohort, not part of the primary test.
- **Latency guardrails:** compare p75 first-readable time within each device class. The ranked arm may not exceed control by more than the larger of 100 ms or 10%. Cover-visible p75 may not exceed control by more than 150 ms; final-cover-failure rate and end-wait rate may not rise by more than 1 percentage point. Do not choose a less relevant first card solely for cover speed.
- **Stop:** collect at least 14 full days and 500 eligible fresh first-card impressions per arm; stop by day 28. Promote only if the primary outcome's 95% confidence interval for ranked minus control is wholly above zero **and** all latency and reliability guardrails pass. If traffic is insufficient or results are mixed at day 28, record the result as inconclusive and keep control behavior. Do not repeatedly peek and stop on a favorable day.

The trial measures a browser-level assignment. Analysis should cluster repeated visits by the existing analytics visitor identity and exclude internal/test traffic using the existing analytics convention. This document does not claim an observed improvement or authorize an automatic rollout decision.
