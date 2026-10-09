"use client";

import { useEffect, useRef } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { settleSearchJourney, trackSearchResultClick } from "@/lib/search-journey-measurement";

interface SearchAnalyticsTrackerProps {
    queryPresent: boolean;
    queryLength?: number;
    resultCount: number;
    filtersCount: number;
    outcome: "results" | "no_results" | "failed" | "input_empty";
    searchKey: string;
    trackLegacyEvents?: boolean;
}

export function SearchAnalyticsTracker({
    queryPresent,
    queryLength,
    resultCount,
    filtersCount,
    outcome,
    searchKey,
    trackLegacyEvents = true,
}: SearchAnalyticsTrackerProps) {
    const lastTrackedKeyRef = useRef<string | null>(null);

    useEffect(() => {
        const key = JSON.stringify({
            queryPresent,
            queryLength,
            resultCount,
            filtersCount,
            outcome,
            searchKey,
        });

        if (lastTrackedKeyRef.current !== key) {
            lastTrackedKeyRef.current = key;
            if (trackLegacyEvents) {
                if (outcome === "input_empty") {
                    captureAnalyticsEvent("search_input_empty", {
                        source: "search_results",
                        route: "/search",
                        search_scope: "content",
                        query_present: queryPresent,
                        query_length: queryLength,
                        filters_count: filtersCount,
                    });
                } else {
                    captureAnalyticsEvent("search_performed", {
                        source: "search_results",
                        route: "/search",
                        search_scope: "content",
                        query_present: queryPresent,
                        query_length: queryLength,
                        result_count: resultCount,
                        filters_count: filtersCount,
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
                        });
                    } else {
                        captureAnalyticsEvent("search_no_results", {
                            source: "search_results",
                            route: "/search",
                            search_scope: "content",
                            query_present: queryPresent,
                            query_length: queryLength,
                            filters_count: filtersCount,
                        });
                    }
                }
            }
        }
        let nextFrame = 0;
        const firstFrame = requestAnimationFrame(() => {
            nextFrame = requestAnimationFrame(() => {
                settleSearchJourney({ searchKey, outcome, resultCount, filtersCount, queryPresent });
            });
        });
        return () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(nextFrame);
        };
    }, [filtersCount, outcome, queryLength, queryPresent, resultCount, searchKey, trackLegacyEvents]);

    useEffect(() => {
        if (outcome !== "results") return;

        const onClick = (event: MouseEvent) => {
            if (!(event.target instanceof Element)) return;
            const link = event.target.closest("[data-search-result-position] a[href^='/preview/'], [data-search-result-position] a[href^='/read/']");
            const position = Number(link?.closest("[data-search-result-position]")?.getAttribute("data-search-result-position"));
            if (link && Number.isInteger(position)) trackSearchResultClick(position);
        };

        document.addEventListener("click", onClick, true);
        return () => document.removeEventListener("click", onClick, true);
    }, [outcome]);

    return null;
}
