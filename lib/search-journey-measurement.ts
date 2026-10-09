"use client";

import { captureAnalyticsEvent } from "@/lib/analytics";

type ActionKind = "query" | "filter";
type Trigger = "submit" | "debounced" | "recent" | "clear" | "link" | "select";
type FilterKind = "topic" | "type" | "sort" | "other";
type Outcome = "results" | "no_results" | "failed" | "input_empty";
type VisibilityState = "foreground" | "backgrounded" | "unknown";
type SettledJourney = {
    id: string;
    actionKind: ActionKind | "initial_load";
    filterKind?: FilterKind;
    navigationKind: "in_app" | "document";
    target: string;
};

type PendingJourney = Omit<SettledJourney, "actionKind" | "navigationKind"> & {
    actionKind: ActionKind;
    navigationKind: "in_app";
    startedAt: number;
    backgrounded: boolean;
};

let pendingJourney: PendingJourney | null = null;
let settledJourney: SettledJourney | null = null;
let documentMeasurementConsumed = false;
let visibilityListenerAttached = false;

function routeKey(url: URL) {
    if (url.pathname !== "/search") return `${url.pathname}${url.search}`;

    // Match the result identity produced by buildSearchHref, regardless of URL
    // parameter order or explicit defaults. Keep query text in memory only.
    const params = new URLSearchParams();
    const query = url.searchParams.get("q")?.trim();
    const category = url.searchParams.get("category");
    const type = url.searchParams.get("type")?.toLowerCase();
    const sort = url.searchParams.get("sort");
    const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const cursor = url.searchParams.get("cursor");
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    if (type && type !== "all") params.set("type", type);
    if (!query && sort === "popular") params.set("sort", "popular");
    if (sort !== "popular" && Number.isFinite(page) && page > 1) params.set("page", String(page));
    if (query && cursor) params.set("cursor", cursor);
    const search = params.toString();
    return search ? `/search?${search}` : "/search";
}

function recordSupersededJourney() {
    if (!pendingJourney) return;
    captureAnalyticsEvent("search_action_superseded", {
        source: "search_results",
        route: "/search",
        journey_id: pendingJourney.id,
        action_kind: pendingJourney.actionKind,
        filter_kind: pendingJourney.filterKind,
    });
    pendingJourney = null;
}

function watchVisibility() {
    if (visibilityListenerAttached) return;
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && pendingJourney) pendingJourney.backgrounded = true;
    });
    visibilityListenerAttached = true;
}

function filterKind(current: URL, target: URL): FilterKind {
    if (current.searchParams.get("category") !== target.searchParams.get("category")) return "topic";
    if (current.searchParams.get("type") !== target.searchParams.get("type")) return "type";
    if (current.searchParams.get("sort") !== target.searchParams.get("sort")) return "sort";
    return "other";
}

export function beginSearchJourney(href: string, actionKind: ActionKind, trigger: Trigger) {
    if (typeof window === "undefined") return;

    const target = new URL(href, window.location.origin);
    const current = new URL(window.location.href);
    if (target.origin !== window.location.origin || target.pathname !== "/search") return;
    if (pendingJourney?.target === routeKey(target)) return;
    recordSupersededJourney();
    if (routeKey(target) === routeKey(current)) return;

    // An in-app action can replace the initial document URL before its result hydrates.
    documentMeasurementConsumed = true;
    watchVisibility();

    pendingJourney = {
        id: crypto.randomUUID(),
        actionKind,
        filterKind: actionKind === "filter" ? filterKind(current, target) : undefined,
        navigationKind: "in_app",
        target: routeKey(target),
        startedAt: performance.now(),
        backgrounded: document.visibilityState !== "visible",
    };
    settledJourney = null;

    captureAnalyticsEvent("search_action_started", {
        source: "search_results",
        route: "/search",
        journey_id: pendingJourney.id,
        action_kind: actionKind,
        filter_kind: pendingJourney.filterKind,
        trigger,
        query_present: Boolean(target.searchParams.get("q")?.trim()),
    });
}

export function settleSearchJourney({
    searchKey,
    outcome,
    resultCount,
    filtersCount,
    queryPresent,
}: {
    searchKey: string;
    outcome: Outcome;
    resultCount: number;
    filtersCount: number;
    queryPresent: boolean;
}) {
    if (typeof window === "undefined") return;

    const currentUrl = routeKey(new URL(window.location.href));
    const resultUrl = new URL(searchKey, window.location.origin);
    if (resultUrl.origin !== window.location.origin || routeKey(resultUrl) !== currentUrl) return;
    if (pendingJourney && pendingJourney.target !== currentUrl) return;

    let journey: SettledJourney;
    let startedAt: number;
    let visibilityState: VisibilityState;

    if (pendingJourney) {
        journey = pendingJourney;
        startedAt = pendingJourney.startedAt;
        visibilityState = pendingJourney.backgrounded || document.visibilityState !== "visible"
            ? "backgrounded"
            : "foreground";
        pendingJourney = null;
    } else {
        const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        if (!navigation || routeKey(new URL(navigation.name)) !== currentUrl || documentMeasurementConsumed) {
            settledJourney = null;
            return;
        }

        documentMeasurementConsumed = true;
        journey = {
            id: crypto.randomUUID(),
            actionKind: "initial_load",
            navigationKind: "document",
            target: currentUrl,
        };
        startedAt = 0;
        // The tracker starts after hydration, so earlier document visibility
        // changes are unobservable even when the tab is visible at settlement.
        visibilityState = document.visibilityState === "visible" ? "unknown" : "backgrounded";
    }

    settledJourney = journey;
    captureAnalyticsEvent("search_journey_settled", {
        source: "search_results",
        route: "/search",
        journey_id: journey.id,
        action_kind: journey.actionKind,
        filter_kind: journey.filterKind,
        navigation_kind: journey.navigationKind,
        outcome,
        elapsed_ms: Math.max(0, Math.round(performance.now() - startedAt)),
        visibility_state: visibilityState,
        result_count: resultCount,
        filters_count: filtersCount,
        query_present: queryPresent,
    });
}

export function trackSearchResultClick(position: number) {
    if (!settledJourney || !Number.isInteger(position) || position < 1 || typeof window === "undefined") return;
    if (routeKey(new URL(window.location.href)) !== settledJourney.target) return;

    captureAnalyticsEvent("search_result_clicked", {
        source: "search_results",
        route: "/search",
        journey_id: settledJourney.id,
        action_kind: settledJourney.actionKind,
        navigation_kind: settledJourney.navigationKind,
        position,
    });
}
