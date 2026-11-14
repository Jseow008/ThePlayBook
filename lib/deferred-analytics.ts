"use client";

import type { PostHog } from "posthog-js";

let client: PostHog | undefined;
let initialized = false;
let loading = false;
let disabled = false;
let pending: Array<(analytics: PostHog) => void> = [];
let cancelIdle: (() => void) | undefined;

function loadAnalytics() {
  if (loading || disabled || client) return;
  loading = true;
  cancelIdle?.();
  window.removeEventListener("load", scheduleIdleLoad);
  window.removeEventListener("pointerdown", loadAnalytics);
  window.removeEventListener("keydown", loadAnalytics);
  document.removeEventListener("visibilitychange", onVisibilityChange);

  void import("posthog-js").then(({ default: analytics }) => {
    if (!analytics.__loaded) {
      analytics.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
        api_host: (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "/flux").replace(/\/$/, ""),
        ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST?.replace(/\/$/, "") || "https://us.posthog.com",
        defaults: "2026-01-30",
        capture_pageview: false,
        capture_pageleave: true,
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        __preview_capture_bot_pageviews: process.env.NEXT_PUBLIC_POSTHOG_CAPTURE_BOT_EVENTS === "true",
      });
    }
    client = analytics;
    const commands = pending;
    pending = [];
    // Identity changes and events must retain their original order.
    for (const command of commands) command(analytics);
  }).catch(() => {
    // Optional analytics must not hold up the app when its SDK is unavailable.
    disabled = true;
    pending = [];
  });
}

function scheduleIdleLoad() {
  if (loading) return;
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(loadAnalytics, { timeout: 1500 });
    cancelIdle = () => window.cancelIdleCallback(id);
  } else {
    const id = window.setTimeout(loadAnalytics, 0);
    cancelIdle = () => window.clearTimeout(id);
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") loadAnalytics();
}

export function initializeDeferredAnalytics() {
  if (typeof window === "undefined" || initialized || !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
  initialized = true;
  // The SDK is not a dependency of hydration. First interaction can expedite it.
  window.addEventListener("pointerdown", loadAnalytics, { once: true, passive: true });
  window.addEventListener("keydown", loadAnalytics, { once: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  if (document.readyState === "complete") scheduleIdleLoad();
  else window.addEventListener("load", scheduleIdleLoad, { once: true });
}

export function withAnalyticsClient(command: (analytics: PostHog) => void) {
  if (typeof window === "undefined" || disabled || !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
  if (client) {
    command(client);
    return;
  }
  pending.push(command);
  initializeDeferredAnalytics();
}
