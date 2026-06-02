"use client";

import posthog from "posthog-js";

type UserState = "anonymous" | "authenticated";

export type AnalyticsEvent =
  | "email_subscribed"
  | "signup_started"
  | "signup_completed"
  | "content_opened"
  | "content_completed"
  | "highlight_created"
  | "note_created"
  | "ai_chat_started"
  | "search_performed"
  | "library_saved"
  | "share_clicked";

export interface AnalyticsProperties {
  source?: string;
  content_id?: string;
  content_type?: string;
  category?: string;
  user_state?: UserState;
  [key: string]: string | number | boolean | null | undefined;
}

export interface AnalyticsPageviewProperties {
  path: string;
  search_present: boolean;
  user_state: UserState;
  content_id?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export function captureAnalyticsEvent(
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {}
) {
  if (typeof window === "undefined") return;

  posthog.capture(event, properties);
}

export function captureAnalyticsPageview(properties: AnalyticsPageviewProperties) {
  if (typeof window === "undefined") return;

  const sanitizedUrl = new URL(properties.path, window.location.origin);

  if (properties.search_present) {
    sanitizedUrl.searchParams.set("query", "present");
  }

  posthog.capture("$pageview", {
    ...properties,
    $current_url: sanitizedUrl.toString(),
  });
}

export function identifyAnalyticsUser(
  userId: string,
  properties?: { email?: string | null }
) {
  if (typeof window === "undefined") return;

  posthog.identify(userId, properties);
}

export function resetAnalyticsUser() {
  if (typeof window === "undefined") return;

  posthog.reset();
}
