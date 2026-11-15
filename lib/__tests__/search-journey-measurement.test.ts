import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ captureAnalyticsEvent: capture }));

describe("Search journey measurement", () => {
    beforeEach(() => {
        vi.resetModules();
        capture.mockReset();
        window.history.replaceState(null, "", "/search");
        vi.spyOn(performance, "now").mockReturnValue(1000);
        vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    });

    afterEach(() => vi.restoreAllMocks());

    it("links completed query text to results and clicks without duplicating it", async () => {
        const { beginSearchJourney, settleSearchJourney, trackSearchResultClick } = await import("@/lib/search-journey-measurement");

        beginSearchJourney("/search?q=private+phrase", "query", "submit");
        window.history.pushState(null, "", "/search?q=private+phrase");
        vi.mocked(performance.now).mockReturnValue(1850);
        settleSearchJourney({ searchKey: "/search?q=private+phrase", outcome: "results", resultCount: 2, filtersCount: 0, queryPresent: true });
        trackSearchResultClick(1);

        expect(capture.mock.calls.map(([event]) => event)).toEqual([
            "search_action_started", "search_query_completed", "search_journey_settled", "search_result_clicked",
        ]);
        expect(capture.mock.calls[2][1]).toMatchObject({
            action_kind: "query", navigation_kind: "in_app", outcome: "results", elapsed_ms: 850,
            visibility_state: "foreground",
        });
        expect(capture.mock.calls[3][1].journey_id).toBe(capture.mock.calls[1][1].journey_id);
        expect(capture.mock.calls[3][1].search_id).toBe(capture.mock.calls[1][1].search_id);
        expect(capture.mock.calls[1][1]).toMatchObject({ query_text: "private phrase", trigger: "submit", search_scope: "content" });
        expect(JSON.stringify(capture.mock.calls.filter(([event]) => event !== "search_query_completed"))).not.toContain("private phrase");
        expect(JSON.stringify(capture.mock.calls)).not.toContain("private+phrase");
    });

    it("does not assign stale results to a newer filter action after the URL advances", async () => {
        const { beginSearchJourney, settleSearchJourney } = await import("@/lib/search-journey-measurement");

        beginSearchJourney("/search?type=book", "filter", "link");
        const firstId = capture.mock.calls[0][1].journey_id;
        beginSearchJourney("/search?type=podcast", "filter", "link");
        expect(capture.mock.calls[1]).toEqual(["search_action_superseded", expect.objectContaining({ journey_id: firstId })]);

        window.history.pushState(null, "", "/search?type=podcast");
        settleSearchJourney({ searchKey: "/search?type=book", outcome: "results", resultCount: 7, filtersCount: 1, queryPresent: false });
        expect(capture.mock.calls.map(([event]) => event)).toEqual([
            "search_action_started", "search_action_superseded", "search_action_started",
        ]);

        settleSearchJourney({ searchKey: "/search?type=podcast", outcome: "no_results", resultCount: 0, filtersCount: 1, queryPresent: false });
        expect(capture.mock.calls[3][1]).toMatchObject({ action_kind: "filter", filter_kind: "type", outcome: "no_results", result_count: 0 });
        expect(capture.mock.calls[3][1].journey_id).toBe(capture.mock.calls[2][1].journey_id);
    });

    it("records automatic, recent and no-result completions once, linking filter and click outcomes", async () => {
        const { beginSearchJourney, settleSearchJourney, trackSearchResultClick } = await import("@/lib/search-journey-measurement");
        const settle = (searchKey: string, outcome: "results" | "no_results" = "results") => {
            window.history.pushState(null, "", searchKey);
            settleSearchJourney({ searchKey, outcome, resultCount: outcome === "results" ? 1 : 0, filtersCount: 0, queryPresent: true });
        };
        beginSearchJourney("/search?q=Endure", "query", "debounced");
        settle("/search?q=Endure");
        settle("/search?q=Endure");
        const completion = capture.mock.calls.find(([event]) => event === "search_query_completed")?.[1];
        expect(completion).toMatchObject({ query_text: "Endure", trigger: "debounced" });
        beginSearchJourney("/search?q=Endure&type=book", "filter", "link");
        settle("/search?q=Endure&type=book");
        trackSearchResultClick(1, "content-1");
        expect(capture.mock.calls.filter(([event]) => event === "search_query_completed")).toHaveLength(1);
        expect(capture.mock.calls.at(-1)?.[1]).toMatchObject({ search_id: completion.search_id, content_id: "content-1" });
        beginSearchJourney("/search?q=missing", "query", "recent");
        settle("/search?q=missing", "no_results");
        expect(capture.mock.calls.filter(([event]) => event === "search_query_completed").at(-1)?.[1]).toMatchObject({ trigger: "recent", outcome: "no_results", query_text: "missing" });
    });

    it("does not capture failed, empty, draft or superseded query text", async () => {
        const { beginSearchJourney, settleSearchJourney, setSearchDraftQuery } = await import("@/lib/search-journey-measurement");
        beginSearchJourney("/search?q=obsolete", "query", "submit");
        beginSearchJourney("/search?q=latest", "query", "submit");
        window.history.pushState(null, "", "/search?q=latest");
        settleSearchJourney({ searchKey: "/search?q=obsolete", outcome: "results", resultCount: 1, filtersCount: 0, queryPresent: true });
        settleSearchJourney({ searchKey: "/search?q=latest", outcome: "failed", resultCount: 0, filtersCount: 0, queryPresent: true });
        beginSearchJourney("/search?q=draft", "query", "submit");
        window.history.pushState(null, "", "/search?q=draft");
        setSearchDraftQuery("newer unfinished draft");
        settleSearchJourney({ searchKey: "/search?q=draft", outcome: "results", resultCount: 1, filtersCount: 0, queryPresent: true });
        expect(capture.mock.calls.some(([event]) => event === "search_query_completed")).toBe(false);
    });

    it("records direct results once and keeps click correlation after an effect replay", async () => {
        window.history.replaceState(null, "", "/search?q=Endure");
        vi.mocked(performance.getEntriesByType).mockReturnValue([{ name: window.location.href } as PerformanceNavigationTiming]);
        const { settleSearchJourney, trackSearchResultClick } = await import("@/lib/search-journey-measurement");
        const result = { searchKey: "/search?q=Endure", outcome: "results" as const, resultCount: 1, filtersCount: 0, queryPresent: true };
        settleSearchJourney(result);
        settleSearchJourney(result);
        trackSearchResultClick(1);
        expect(capture.mock.calls.filter(([event]) => event === "search_query_completed")).toHaveLength(1);
        expect(capture.mock.calls[0][1]).toMatchObject({ query_text: "Endure", trigger: "direct" });
        expect(capture.mock.calls.at(-1)?.[1]).toMatchObject({ search_id: capture.mock.calls[0][1].search_id });
    });

    it("captures a successful retry and unmeasured Back navigation without inventing latency", async () => {
        const { beginSearchJourney, settleSearchJourney } = await import("@/lib/search-journey-measurement");
        const result = { searchKey: "/search?q=Endure", resultCount: 1, filtersCount: 0, queryPresent: true };
        beginSearchJourney(result.searchKey, "query", "submit");
        window.history.pushState(null, "", result.searchKey);
        settleSearchJourney({ ...result, outcome: "failed" });
        settleSearchJourney({ ...result, outcome: "results" });
        expect(capture.mock.calls.filter(([event]) => event === "search_query_completed")).toHaveLength(1);
        expect(capture.mock.calls.filter(([event]) => event === "search_journey_settled")).toHaveLength(1);
        window.history.pushState(null, "", "/search?q=another");
        settleSearchJourney({ ...result, searchKey: "/search?q=another", outcome: "no_results" });
        expect(capture.mock.calls.at(-1)).toEqual(["search_query_completed", expect.objectContaining({ query_text: "another", trigger: "link" })]);
    });

    it.each([
        {
            firstHref: "/search?type=book", firstParam: "type", firstValue: "book", firstKind: "type",
            secondRenderedHref: "/search?category=Business&type=podcast", secondParam: "category", secondValue: "Business", secondKind: "topic",
        },
        {
            firstHref: "/search?category=Business&type=podcast", firstParam: "category", firstValue: "Business", firstKind: "topic",
            secondRenderedHref: "/search?type=book", secondParam: "type", secondValue: "book", secondKind: "type",
        },
    ] as const)("keeps rapid $firstKind then $secondKind selections while results load", async (scenario) => {
        window.history.replaceState(null, "", "/search?type=podcast");
        const { beginSearchJourney, resolveSearchFilterHref } = await import("@/lib/search-journey-measurement");

        const firstHref = resolveSearchFilterHref(scenario.firstHref, scenario.firstParam, scenario.firstValue);
        beginSearchJourney(firstHref, "filter", "link", scenario.firstKind);
        const secondHref = resolveSearchFilterHref(scenario.secondRenderedHref, scenario.secondParam, scenario.secondValue);
        beginSearchJourney(secondHref, "filter", "link", scenario.secondKind);

        expect(secondHref).toBe("/search?category=Business&type=book");
        expect(capture.mock.calls.map(([event]) => event)).toEqual([
            "search_action_started", "search_action_superseded", "search_action_started",
        ]);
        expect(capture.mock.calls[2][1]).toMatchObject({ action_kind: "filter", filter_kind: scenario.secondKind });
    });

    it("keeps a newly typed query and the latest type choice during overlapping navigation", async () => {
        window.history.replaceState(null, "", "/search?q=Disney&type=podcast");
        const { beginSearchJourney, resolveSearchFilterHref, resolveSearchQueryHref, setSearchDraftQuery } = await import("@/lib/search-journey-measurement");

        setSearchDraftQuery("Google");
        const filterHref = resolveSearchFilterHref("/search?q=Disney&type=book", "type", "book");
        expect(filterHref).toBe("/search?q=Google&type=book");
        beginSearchJourney(filterHref, "filter", "link", "type");

        const queryHref = resolveSearchQueryHref("/search?q=Google&type=podcast", "Google");
        expect(queryHref).toBe("/search?q=Google&type=book");
        setSearchDraftQuery(null);
    });

    it("normalizes equivalent result keys but rejects results from a different query", async () => {
        const { beginSearchJourney, settleSearchJourney } = await import("@/lib/search-journey-measurement");

        beginSearchJourney("/search?q=phrase&type=book", "query", "submit");
        window.history.pushState(null, "", "/search?type=book&q=phrase&sort=recent");
        settleSearchJourney({ searchKey: "/search?q=other&type=book", outcome: "results", resultCount: 4, filtersCount: 1, queryPresent: true });
        expect(capture).toHaveBeenCalledTimes(1);
        settleSearchJourney({ searchKey: "/search?q=phrase&type=book", outcome: "results", resultCount: 2, filtersCount: 1, queryPresent: true });
        expect(capture.mock.calls.find(([event]) => event === "search_journey_settled")?.[1]).toMatchObject({ result_count: 2, outcome: "results" });
    });

    it("marks an action that was hidden before settlement as backgrounded", async () => {
        const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        const { beginSearchJourney, settleSearchJourney } = await import("@/lib/search-journey-measurement");

        beginSearchJourney("/search?q=book", "query", "submit");
        visibility.mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
        visibility.mockReturnValue("visible");
        window.history.pushState(null, "", "/search?q=book");
        settleSearchJourney({ searchKey: "/search?q=book", outcome: "results", resultCount: 1, filtersCount: 0, queryPresent: true });

        expect(capture.mock.calls.find(([event]) => event === "search_journey_settled")?.[1]).toMatchObject({ visibility_state: "backgrounded" });
    });

    it("records a direct document load once and keeps failures distinct", async () => {
        window.history.replaceState(null, "", "/search?q=broken");
        vi.mocked(performance.getEntriesByType).mockReturnValue([{
            name: window.location.href,
        } as PerformanceNavigationTiming]);
        const { settleSearchJourney } = await import("@/lib/search-journey-measurement");

        settleSearchJourney({ searchKey: "/search?q=broken", outcome: "failed", resultCount: 0, filtersCount: 0, queryPresent: true });
        settleSearchJourney({ searchKey: "/search?q=broken", outcome: "failed", resultCount: 0, filtersCount: 0, queryPresent: true });

        expect(capture).toHaveBeenCalledTimes(1);
        expect(capture.mock.calls[0][1]).toMatchObject({
            action_kind: "initial_load", navigation_kind: "document", outcome: "failed", elapsed_ms: 1000,
            visibility_state: "unknown",
        });
    });
});
