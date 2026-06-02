"use client";

import posthog from "posthog-js";
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

  posthog.capture(event, sanitizeAnalyticsProperties(event, properties));
}

export function captureAnalyticsPageview(properties: AnalyticsPageviewProperties) {
  if (typeof window === "undefined") return;

  const sanitizedUrl = new URL(properties.path, window.location.origin);

  if (properties.search_present) {
    sanitizedUrl.searchParams.set("query", "present");
  }

  posthog.capture("$pageview", {
    ...properties,
    schema_version: ANALYTICS_SCHEMA_VERSION,
    $current_url: sanitizedUrl.toString(),
  });
}

export function identifyAnalyticsUser(
  userId: string,
  properties: AnalyticsIdentityProperties = {}
) {
  if (typeof window === "undefined") return;

  posthog.identify(userId, properties);
}

export function resetAnalyticsUser() {
  if (typeof window === "undefined") return;

  posthog.reset();
}
