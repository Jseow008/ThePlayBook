const LOOKBACK = "-30d";
const DASHBOARD_TAGS = ["netflux", "phase-9", "analytics"];

const PRODUCT_EVENTS = [
  "signup_started",
  "signup_completed",
  "content_opened",
  "content_completed",
  "library_saved",
  "highlight_created",
  "note_created",
  "ai_chat_started",
  "search_performed",
  "share_clicked",
  "email_subscribed",
];

const KNOWN_EVENTS = ["$pageview", "$pageleave", ...PRODUCT_EVENTS];

function eventNode(event, name = event, math = "total") {
  return {
    kind: "EventsNode",
    event,
    name,
    math,
  };
}

function trendInsight(name, description, series, options = {}) {
  return {
    name,
    description,
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        series,
        dateRange: { date_from: options.dateFrom ?? LOOKBACK },
        interval: options.interval ?? "day",
        trendsFilter: {
          display: options.display ?? "ActionsLineGraph",
          showLegend: true,
        },
      },
    },
  };
}

function funnelInsight(name, description, series, options = {}) {
  return {
    name,
    description,
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "FunnelsQuery",
        series,
        dateRange: { date_from: options.dateFrom ?? LOOKBACK },
        funnelsFilter: {
          layout: options.layout ?? "horizontal",
        },
      },
    },
  };
}

function hogqlInsight(name, description, query) {
  return {
    name,
    description,
    query: {
      kind: "DataTableNode",
      full: true,
      source: {
        kind: "HogQLQuery",
        query,
      },
    },
  };
}

function quotedEvents(events) {
  return events.map((event) => `'${event.replace(/'/g, "\\'")}'`).join(", ");
}

const knownEventList = quotedEvents(KNOWN_EVENTS);

// Manual mirror of ANALYTICS_EVENT_CONTRACTS.requiredProperties in
// lib/analytics-events.ts. Update this when changing event required properties.
const requiredPropertyRules = [
  "(event = 'email_subscribed' AND properties.source IS NULL)",
  "(event = 'signup_started' AND (properties.source IS NULL OR properties.auth_method IS NULL))",
  "(event = 'signup_completed' AND properties.source IS NULL)",
  "(event = 'content_opened' AND properties.content_id IS NULL)",
  "(event = 'content_completed' AND properties.content_id IS NULL)",
  "(event = 'highlight_created' AND properties.content_id IS NULL)",
  "(event = 'note_created' AND properties.content_id IS NULL)",
  "(event = 'ai_chat_started' AND properties.source IS NULL)",
  "(event = 'search_performed' AND (properties.source IS NULL OR properties.query_present IS NULL))",
  "(event = 'library_saved' AND properties.content_id IS NULL)",
  "(event = 'share_clicked' AND properties.source IS NULL)",
].join("\n    OR ");

export const netfluxPostHogDashboards = [
  {
    name: "Netflux - Acquisition",
    description: "Top-of-funnel visibility: visitors, signup starts, signup completions, and email subscriptions.",
    tags: DASHBOARD_TAGS,
    insights: [
      trendInsight(
        "Acquisition - Visitors and signup events",
        "Daily pageviews, signup starts, signup completions, and email subscriptions.",
        [
          eventNode("$pageview", "Pageviews"),
          eventNode("signup_started", "Signup started"),
          eventNode("signup_completed", "Signup completed"),
          eventNode("email_subscribed", "Email subscribed"),
        ]
      ),
      funnelInsight(
        "Acquisition - Signup funnel",
        "Signup intent to server-confirmed signup completion.",
        [
          eventNode("signup_started", "Signup started"),
          eventNode("signup_completed", "Signup completed"),
        ]
      ),
      funnelInsight(
        "Acquisition - Visitor to signup funnel",
        "Any pageview to signup start to signup completion.",
        [
          eventNode("$pageview", "Pageview"),
          eventNode("signup_started", "Signup started"),
          eventNode("signup_completed", "Signup completed"),
        ]
      ),
      hogqlInsight(
        "Acquisition - Signup method mix",
        "Signup starts grouped by auth method without storing email addresses.",
        `SELECT
    properties.auth_method AS auth_method,
    count() AS signup_starts
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event = 'signup_started'
GROUP BY auth_method
ORDER BY signup_starts DESC`
      ),
    ],
  },
  {
    name: "Netflux - Activation",
    description: "Activation funnel from visitor to signup to first read and first knowledge action.",
    tags: DASHBOARD_TAGS,
    insights: [
      funnelInsight(
        "Activation - Visitor to first save funnel",
        "Pageview to signup to content open to library save.",
        [
          eventNode("$pageview", "Pageview"),
          eventNode("signup_started", "Signup started"),
          eventNode("signup_completed", "Signup completed"),
          eventNode("content_opened", "Content opened"),
          eventNode("library_saved", "Library saved"),
        ]
      ),
      funnelInsight(
        "Activation - Read to knowledge action funnel",
        "Content open to highlight to note creation.",
        [
          eventNode("content_opened", "Content opened"),
          eventNode("highlight_created", "Highlight created"),
          eventNode("note_created", "Note created"),
        ]
      ),
      trendInsight(
        "Activation - First action event volume",
        "Daily content opens, saves, highlights, and notes.",
        [
          eventNode("content_opened", "Content opened"),
          eventNode("library_saved", "Library saved"),
          eventNode("highlight_created", "Highlight created"),
          eventNode("note_created", "Note created"),
        ]
      ),
    ],
  },
  {
    name: "Netflux - Engagement",
    description: "Active usage, stickiness proxies, and repeated product engagement.",
    tags: DASHBOARD_TAGS,
    insights: [
      trendInsight(
        "Engagement - DAU, WAU, MAU",
        "Unique active visitors based on pageviews.",
        [
          eventNode("$pageview", "DAU", "dau"),
          eventNode("$pageview", "WAU", "weekly_active"),
          eventNode("$pageview", "MAU", "monthly_active"),
        ]
      ),
      trendInsight(
        "Engagement - Product event volume",
        "Core product events by day.",
        [
          eventNode("content_opened", "Content opened"),
          eventNode("library_saved", "Library saved"),
          eventNode("highlight_created", "Highlight created"),
          eventNode("note_created", "Note created"),
          eventNode("ai_chat_started", "AI chat started"),
          eventNode("search_performed", "Search performed"),
        ]
      ),
      hogqlInsight(
        "Engagement - Active days distribution",
        "How many days each active distinct_id used Netflux in the last 30 days.",
        `SELECT
    active_days,
    count() AS users
FROM (
    SELECT
        distinct_id,
        count(DISTINCT toDate(timestamp)) AS active_days
    FROM events
    WHERE timestamp >= now() - INTERVAL 30 DAY
      AND event IN (${quotedEvents(["$pageview", ...PRODUCT_EVENTS])})
    GROUP BY distinct_id
)
GROUP BY active_days
ORDER BY active_days ASC`
      ),
    ],
  },
  {
    name: "Netflux - Reading",
    description: "Reading behavior: content opens, completion rate, repeat readers, and content IDs with traction.",
    tags: DASHBOARD_TAGS,
    insights: [
      trendInsight(
        "Reading - Opens and completions",
        "Daily content opens and content completions.",
        [
          eventNode("content_opened", "Content opened"),
          eventNode("content_completed", "Content completed"),
        ]
      ),
      funnelInsight(
        "Reading - Completion funnel",
        "Content opened to content completed.",
        [
          eventNode("content_opened", "Content opened"),
          eventNode("content_completed", "Content completed"),
        ]
      ),
      hogqlInsight(
        "Reading - Repeat readers",
        "Distinct users with at least two content_opened events in the last 30 days.",
        `SELECT
    count() AS repeat_readers
FROM (
    SELECT
        distinct_id,
        count() AS opens
    FROM events
    WHERE timestamp >= now() - INTERVAL 30 DAY
      AND event = 'content_opened'
    GROUP BY distinct_id
    HAVING opens >= 2
)`
      ),
      hogqlInsight(
        "Reading - Top content IDs by opens",
        "Top content IDs by content_opened count.",
        `SELECT
    properties.content_id AS content_id,
    count() AS opens,
    uniq(distinct_id) AS unique_readers
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event = 'content_opened'
GROUP BY content_id
ORDER BY opens DESC
LIMIT 25`
      ),
    ],
  },
  {
    name: "Netflux - Knowledge Actions",
    description: "Library saves, highlights, notes, and share actions that indicate knowledge capture.",
    tags: DASHBOARD_TAGS,
    insights: [
      trendInsight(
        "Knowledge - Saves, highlights, notes",
        "Daily count of library saves, highlights, and notes.",
        [
          eventNode("library_saved", "Library saved"),
          eventNode("highlight_created", "Highlight created"),
          eventNode("note_created", "Note created"),
        ]
      ),
      trendInsight(
        "Knowledge - Sharing",
        "Daily share/copy/download successes.",
        [eventNode("share_clicked", "Share clicked")]
      ),
      hogqlInsight(
        "Knowledge - Top content IDs by knowledge actions",
        "Content IDs with the most saves, highlights, and notes.",
        `SELECT
    properties.content_id AS content_id,
    countIf(event = 'library_saved') AS saves,
    countIf(event = 'highlight_created') AS highlights,
    countIf(event = 'note_created') AS notes,
    saves + highlights + notes AS total_actions
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event IN ('library_saved', 'highlight_created', 'note_created')
GROUP BY content_id
ORDER BY total_actions DESC
LIMIT 25`
      ),
    ],
  },
  {
    name: "Netflux - AI",
    description: "AI feature adoption and chat-start behavior.",
    tags: DASHBOARD_TAGS,
    insights: [
      trendInsight(
        "AI - Chat starts",
        "Daily first-message chat starts.",
        [eventNode("ai_chat_started", "AI chat started")]
      ),
      hogqlInsight(
        "AI - Chats per active user",
        "AI chat starts divided by active users over the last 30 days.",
        `SELECT
    countIf(event = 'ai_chat_started') AS chats_started,
    uniqIf(distinct_id, event IN (${quotedEvents(["$pageview", ...PRODUCT_EVENTS])})) AS active_users,
    if(active_users = 0, 0, round(chats_started / active_users, 2)) AS chats_per_active_user
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY`
      ),
      hogqlInsight(
        "AI - Chat starts by scope",
        "AI chat starts grouped by chat_scope.",
        `SELECT
    properties.chat_scope AS chat_scope,
    count() AS chats_started,
    uniq(distinct_id) AS users
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event = 'ai_chat_started'
GROUP BY chat_scope
ORDER BY chats_started DESC`
      ),
    ],
  },
  {
    name: "Netflux - Data Quality",
    description: "Instrumentation health: unknown events, missing required properties, and internal-user traffic.",
    tags: DASHBOARD_TAGS,
    insights: [
      hogqlInsight(
        "Data Quality - Unknown non-system events",
        "Events not in the Netflux analytics registry, excluding PostHog system events.",
        `SELECT
    event,
    count() AS events
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event NOT IN (${knownEventList})
  AND event NOT LIKE '$%'
GROUP BY event
ORDER BY events DESC
LIMIT 50`
      ),
      hogqlInsight(
        "Data Quality - Missing required properties",
        "Tracked Netflux events missing required contract properties.",
        `SELECT
    event,
    count() AS events_missing_required_properties
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND (
    ${requiredPropertyRules}
  )
GROUP BY event
ORDER BY events_missing_required_properties DESC`
      ),
      hogqlInsight(
        "Data Quality - Internal user traffic",
        "Events from people identified with is_internal = true.",
        `SELECT
    event,
    count() AS internal_events
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND person.properties.is_internal = true
GROUP BY event
ORDER BY internal_events DESC
LIMIT 50`
      ),
    ],
  },
];
