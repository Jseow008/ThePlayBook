import posthog from "posthog-js";

const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.replace(/\/$/, "");
const posthogUiHost = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST?.replace(/\/$/, "");

if (posthogProjectToken && posthogHost && !posthog.__loaded) {
  posthog.init(posthogProjectToken, {
    api_host: posthogHost,
    ui_host: posthogUiHost || "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
  });
}
