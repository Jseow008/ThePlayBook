import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "/flux").replace(/\/$/, "");
const posthogUiHost = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST?.replace(/\/$/, "");
const captureBotEvents = process.env.NEXT_PUBLIC_POSTHOG_CAPTURE_BOT_EVENTS === "true";

if (posthogProjectToken && posthogHost && !posthog.__loaded) {
  posthog.init(posthogProjectToken, {
    api_host: posthogHost,
    ui_host: posthogUiHost || "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    __preview_capture_bot_pageviews: captureBotEvents,
  });
}
