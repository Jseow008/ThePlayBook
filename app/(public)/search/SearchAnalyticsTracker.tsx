"use client";

import { useEffect, useRef } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics";

interface SearchAnalyticsTrackerProps {
    queryPresent: boolean;
    queryLength?: number;
    resultCount: number;
    filtersCount: number;
    outcome: "results" | "no_results" | "failed" | "input_empty";
}

export function SearchAnalyticsTracker({
    queryPresent,
    queryLength,
    resultCount,
    filtersCount,
    outcome,
}: SearchAnalyticsTrackerProps) {
    const lastTrackedKeyRef = useRef<string | null>(null);

    useEffect(() => {
        const key = JSON.stringify({
            queryPresent,
            queryLength,
            resultCount,
            filtersCount,
            outcome,
        });

        if (lastTrackedKeyRef.current === key) {
            return;
        }

        lastTrackedKeyRef.current = key;
        if (outcome === "input_empty") {
            captureAnalyticsEvent("search_input_empty", {
                source: "search_results",
                route: "/search",
                search_scope: "content",
                query_present: queryPresent,
                query_length: queryLength,
                filters_count: filtersCount,
                user_state: "anonymous",
            });
            return;
        }

        captureAnalyticsEvent("search_performed", {
            source: "search_results",
            route: "/search",
            search_scope: "content",
            query_present: queryPresent,
            query_length: queryLength,
            result_count: resultCount,
            filters_count: filtersCount,
            user_state: "anonymous",
        });

        if (outcome === "results") {
            captureAnalyticsEvent("search_results", {
                source: "search_results",
                route: "/search",
                search_scope: "content",
                query_present: queryPresent,
                query_length: queryLength,
                result_count: resultCount,
                filters_count: filtersCount,
                user_state: "anonymous",
            });
        } else if (outcome === "failed") {
            captureAnalyticsEvent("search_failed", {
                source: "search_results",
                route: "/search",
                search_scope: "content",
                query_present: queryPresent,
                query_length: queryLength,
                filters_count: filtersCount,
                failure_kind: "unavailable",
                user_state: "anonymous",
            });
        } else {
            captureAnalyticsEvent("search_no_results", {
                source: "search_results",
                route: "/search",
                search_scope: "content",
                query_present: queryPresent,
                query_length: queryLength,
                filters_count: filtersCount,
                user_state: "anonymous",
            });
        }
    }, [filtersCount, outcome, queryLength, queryPresent, resultCount]);

    return null;
}
