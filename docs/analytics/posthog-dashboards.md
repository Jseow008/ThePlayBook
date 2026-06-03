# PostHog Dashboards

Phase 9 creates PostHog dashboards before building any internal Netflux metrics UI.

## Setup

Create a PostHog personal API key with these scopes:

- `dashboard:read`
- `dashboard:write`
- `insight:read`
- `insight:write`

Use the PostHog environment/project id from the URL, for example:

```bash
POSTHOG_HOST=https://us.posthog.com \
POSTHOG_ENVIRONMENT_ID=450488 \
POSTHOG_PERSONAL_API_KEY=phx_... \
npm run posthog:dashboards
```

Preview the planned work without calling the API:

```bash
npm run posthog:dashboards -- --dry-run
```

Reuse existing dashboards and insights without updating insight definitions:

```bash
POSTHOG_ENVIRONMENT_ID=450488 \
POSTHOG_PERSONAL_API_KEY=phx_... \
npm run posthog:dashboards -- --no-update
```

Do not commit `POSTHOG_PERSONAL_API_KEY`. Revoke any personal key pasted into chat or logs.

## Dashboards

The spec lives in `config/posthog/netflux-dashboard-spec.mjs`.

- `Netflux - Acquisition`
  - Visitors and signup events
  - Signup funnel
  - Visitor to signup funnel
  - Signup method mix

- `Netflux - Activation`
  - Visitor to first save funnel
  - Read to knowledge action funnel
  - First action event volume

- `Netflux - Engagement`
  - DAU, WAU, MAU
  - Product event volume
  - Active days distribution

- `Netflux - Reading`
  - Opens and completions
  - Completion funnel
  - Repeat readers
  - Top content IDs by opens

- `Netflux - Knowledge Actions`
  - Saves, highlights, notes
  - Sharing
  - Top content IDs by knowledge actions

- `Netflux - AI`
  - Chat starts
  - Chats per active user
  - Chat starts by scope

- `Netflux - Data Quality`
  - Unknown non-system events
  - Missing required properties
  - Internal user traffic

## Notes

- Dashboard creation uses PostHog's `/api/environments/:environment_id/dashboards/` endpoint.
- Insight creation/update uses PostHog's `/api/environments/:environment_id/insights/` endpoint.
- The script is idempotent by exact dashboard and insight name.
- HogQL data-quality insights assume PostHog person properties are populated by the Phase 4 identity lifecycle.

