import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  __loaded: false,
  init: vi.fn(), capture: vi.fn(), identify: vi.fn(), reset: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: sdk }));

let idle: IdleRequestCallback | undefined;
const readyState = Object.getOwnPropertyDescriptor(document, "readyState");

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  sdk.__loaded = false;
  sdk.init.mockImplementation(() => { sdk.__loaded = true; });
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  Object.defineProperty(document, "readyState", { configurable: true, value: "loading" });
  idle = undefined;
  vi.stubGlobal("requestIdleCallback", vi.fn((callback: IdleRequestCallback) => { idle = callback; return 1; }));
  vi.stubGlobal("cancelIdleCallback", vi.fn());
});

afterEach(async () => {
  // Complete any registered loader so listeners do not leak between module resets.
  window.dispatchEvent(new Event("pointerdown"));
  await vi.dynamicImportSettled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (readyState) Object.defineProperty(document, "readyState", readyState);
  else Reflect.deleteProperty(document, "readyState");
});

async function loadAtIdle() {
  window.dispatchEvent(new Event("load"));
  expect(idle).toBeTypeOf("function");
  idle!({ didTimeout: false, timeRemaining: () => 10 });
  await vi.dynamicImportSettled();
}

describe("deferred analytics", () => {
  it("waits for page load and idle, then preserves identity/event/reset order", async () => {
    const { initializeDeferredAnalytics, withAnalyticsClient } = await import("@/lib/deferred-analytics");
    const calls: string[] = [];
    sdk.identify.mockImplementation(() => { calls.push("identify"); });
    sdk.capture.mockImplementation(() => { calls.push("capture"); });
    sdk.reset.mockImplementation(() => { calls.push("reset"); });
    initializeDeferredAnalytics();
    initializeDeferredAnalytics();
    withAnalyticsClient(client => client.identify("user-a"));
    withAnalyticsClient(client => client.capture("first"));
    withAnalyticsClient(client => client.reset());
    expect(sdk.init).not.toHaveBeenCalled();
    expect(idle).toBeUndefined();
    window.dispatchEvent(new Event("load"));
    expect(sdk.init).not.toHaveBeenCalled();
    idle!({ didTimeout: false, timeRemaining: () => 10 });
    await vi.dynamicImportSettled();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith("phc_test", expect.objectContaining({
      api_host: "/flux", capture_pageview: false, capture_pageleave: true,
      autocapture: false, disable_session_recording: true, disable_surveys: true,
    }));
    expect(calls).toEqual(["identify", "capture", "reset"]);
    withAnalyticsClient(client => client.capture("second"));
    expect(sdk.capture).toHaveBeenCalledTimes(2);
  });

  it("keeps original event times and sanitized URLs across navigation before loading", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1000);
    window.history.replaceState(null, "", "/search?q=private+phrase");
    const { captureAnalyticsEvent, captureAnalyticsPageview } = await import("@/lib/analytics");
    captureAnalyticsPageview({ path: "/search", search_present: true, user_state: "anonymous" });
    captureAnalyticsEvent("search_action_started", {
      source: "search_results", route: "/search", journey_id: "test",
      action_kind: "query", trigger: "submit", query_present: true,
    });
    window.history.replaceState(null, "", "/browse");
    vi.setSystemTime(5000);
    await loadAtIdle();
    expect(sdk.capture).toHaveBeenCalledWith("$pageview", expect.objectContaining({
      path: "/search", $current_url: `${window.location.origin}/search?query=present`,
    }), { timestamp: new Date(1000) });
    expect(sdk.capture).toHaveBeenCalledWith("search_action_started", expect.objectContaining({
      $current_url: `${window.location.origin}/search`,
    }), { timestamp: new Date(1000) });
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain("private");
  });

  it("expedites on interaction and initializes only once", async () => {
    const { initializeDeferredAnalytics } = await import("@/lib/deferred-analytics");
    initializeDeferredAnalytics();
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("keydown"));
    window.dispatchEvent(new Event("load"));
    await vi.dynamicImportSettled();
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("works when the browser has no idle callback", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    const { withAnalyticsClient } = await import("@/lib/deferred-analytics");
    withAnalyticsClient(client => client.capture("fallback"));
    window.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(sdk.capture).toHaveBeenCalledWith("fallback"));
  });

  it("keeps an SDK initialization failure from breaking the app", async () => {
    sdk.init.mockImplementationOnce(() => { throw new Error("Unavailable SDK"); });
    const { withAnalyticsClient } = await import("@/lib/deferred-analytics");
    withAnalyticsClient(client => client.capture("queued"));
    await loadAtIdle();
    expect(() => withAnalyticsClient(client => client.capture("later"))).not.toThrow();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("does not load unconfigured analytics", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    const { initializeDeferredAnalytics, withAnalyticsClient } = await import("@/lib/deferred-analytics");
    initializeDeferredAnalytics();
    withAnalyticsClient(client => client.capture("disabled"));
    window.dispatchEvent(new Event("load"));
    expect(idle).toBeUndefined();
    expect(sdk.init).not.toHaveBeenCalled();
  });
});
