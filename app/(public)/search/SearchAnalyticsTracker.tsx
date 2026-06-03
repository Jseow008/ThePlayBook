"use client";

import { useEffect, useRef } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics";

interface SearchAnalyticsTrackerProps {
    queryPresent: boolean;
    queryLength?: number;
    resultCount: number;
    filtersCount: number;
}

export function SearchAnalyticsTracker({
    queryPresent,
    queryLength,
    resultCount,
    filtersCount,
}: SearchAnalyticsTrackerProps) {
    const lastTrackedKeyRef = useRef<string | null>(null);

    useEffect(() => {
        const key = JSON.stringify({
            queryPresent,
            queryLength,
            resultCount,
            filtersCount,
        });

        if (lastTrackedKeyRef.current === key) {
            return;
        }

        lastTrackedKeyRef.current = key;
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
    }, [filtersCount, queryLength, queryPresent, resultCount]);

    return null;
}

