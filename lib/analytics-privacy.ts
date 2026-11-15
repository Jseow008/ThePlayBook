import type { PostHog } from "posthog-js";

// Only the dedicated, typed catalog completion event may carry query text.
const TEXT_KEYS = new Set(["query", "q", "raw_query", "search_query", "query_text"]);

export function sanitizeAnalyticsUrl(value: string): string {
  if (!/^(https?:\/\/|\/)/i.test(value)) return value;
  try {
    const absolute = /^https?:\/\//i.test(value);
    const url = new URL(value, "https://analytics.invalid");
    for (const key of [...url.searchParams.keys()]) {
      if (TEXT_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.hash = "";
    return absolute ? url.toString() : `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

export function sanitizeAnalyticsMetadata(value: unknown): unknown {
  if (typeof value === "string") return sanitizeAnalyticsUrl(value);
  if (Array.isArray(value)) return value.map(sanitizeAnalyticsMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !TEXT_KEYS.has(key.toLowerCase()))
    .map(([key, item]) => [key, sanitizeAnalyticsMetadata(item)]));
}

export function sanitizeAnalyticsPersistence(analytics: PostHog) {
  // Repair previously saved initial/session URLs before flags or queued events
  // read them. Preserve identity, session IDs, flags, consent and app history.
  for (const persistence of [analytics.persistence, analytics.sessionPersistence]) {
    if (!persistence) continue;
    const clean = sanitizeAnalyticsMetadata(persistence.props) as Record<string, unknown>;
    if (JSON.stringify(clean) === JSON.stringify(persistence.props)) continue;
    for (const key of Object.keys(persistence.props)) {
      if (TEXT_KEYS.has(key.toLowerCase())) persistence.unregister(key);
    }
    persistence.register(clean);
  }
}
