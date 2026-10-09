"use client";

import { captureAnalyticsEvent } from "@/lib/analytics";

type ActionKind = "query" | "filter";
type Trigger = "submit" | "debounced" | "recent" | "clear" | "link" | "select";
type FilterKind = "topic" | "type" | "sort" | "other";
type Outcome = "results" | "no_results" | "failed" | "input_empty";
type SettledJourney = {
    id: string;
    actionKind: ActionKind | "initial_load";
    filterKind?: FilterKind;
    navigationKind: "in_app" | "document";
    target: string;
};

type PendingJourney = SettledJourney & {
    startedAt: number;
};

let pendingJourney: PendingJourney | null = null;
let settledJourney: SettledJourney | null = null;
let documentMeasurementConsumed = false;

function routeKey(url: URL) {
    return `${url.pathname}${url.search}`;
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
    if (routeKey(target) === routeKey(current)) return;
    if (pendingJourney?.target === routeKey(target)) return;

    // An in-app action can replace the initial document URL before its result hydrates.
    documentMeasurementConsumed = true;

    pendingJourney = {
        id: crypto.randomUUID(),
        actionKind,
        filterKind: actionKind === "filter" ? filterKind(current, target) : undefined,
        navigationKind: "in_app",
        target: routeKey(target),
        startedAt: performance.now(),
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
    outcome,
    resultCount,
    filtersCount,
    queryPresent,
}: {
    outcome: Outcome;
    resultCount: number;
    filtersCount: number;
    queryPresent: boolean;
}) {
    if (typeof window === "undefined") return;

    const currentUrl = routeKey(new URL(window.location.href));
    if (pendingJourney && pendingJourney.target !== currentUrl) return;

    let journey: SettledJourney;
    let startedAt: number;

    if (pendingJourney) {
        journey = pendingJourney;
        startedAt = pendingJourney.startedAt;
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
