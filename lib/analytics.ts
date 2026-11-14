"use client";

import { withAnalyticsClient } from "@/lib/deferred-analytics";
import {
  ANALYTICS_SCHEMA_VERSION,
  sanitizeAnalyticsProperties,
  type AnalyticsEvent,
  type AnalyticsEventProperties,
  type AnalyticsUserState,
} from "@/lib/analytics-events";

export interface AnalyticsPageviewProperties {
  path: string;
  search_present: boolean;
  user_state: AnalyticsUserState;
  content_id?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface AnalyticsIdentityProperties {
  account_role?: "user" | "admin";
  is_internal?: boolean;
  profile_available?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}

export function captureAnalyticsEvent<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEventProperties<E>
) {
  if (typeof window === "undefined") return;

  const sanitized = sanitizeAnalyticsProperties(event, properties);
  const timestamp = new Date();
  // PostHog otherwise appends the browser URL, including the private Search query.
  if (event.startsWith("search_")) {
    const payload = {
      ...sanitized,
      $current_url: new URL("/search", window.location.origin).toString(),
    };
    withAnalyticsClient(client => client.capture(event, payload, { timestamp }));
    return;
  }

  const payload = { ...sanitized, $current_url: window.location.href };
  withAnalyticsClient(client => client.capture(event, payload, { timestamp }));
}

export function captureAnalyticsPageview(properties: AnalyticsPageviewProperties) {
  if (typeof window === "undefined") return;

  const sanitizedUrl = new URL(properties.path, window.location.origin);

  if (properties.search_present) {
    sanitizedUrl.searchParams.set("query", "present");
  }

  const timestamp = new Date();
  const payload = {
    ...properties,
    schema_version: ANALYTICS_SCHEMA_VERSION,
    $current_url: sanitizedUrl.toString(),
  };
  withAnalyticsClient(client => client.capture("$pageview", payload, { timestamp }));
}

export function identifyAnalyticsUser(
  userId: string,
  properties: AnalyticsIdentityProperties = {}
) {
  if (typeof window === "undefined") return;

  withAnalyticsClient(client => client.identify(userId, properties));
}

export function resetAnalyticsUser() {
  if (typeof window === "undefined") return;

  withAnalyticsClient(client => client.reset());
}
