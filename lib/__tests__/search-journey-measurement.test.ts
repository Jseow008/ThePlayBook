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

    it("matches the latest query action to painted results without sending query text", async () => {
        const { beginSearchJourney, settleSearchJourney, trackSearchResultClick } = await import("@/lib/search-journey-measurement");

        beginSearchJourney("/search?q=private+phrase", "query", "submit");
        window.history.pushState(null, "", "/search?q=private+phrase");
        vi.mocked(performance.now).mockReturnValue(1850);
        settleSearchJourney({ searchKey: "/search?q=private+phrase", outcome: "results", resultCount: 2, filtersCount: 0, queryPresent: true });
        trackSearchResultClick(1);

        expect(capture.mock.calls.map(([event]) => event)).toEqual([
            "search_action_started", "search_journey_settled", "search_result_clicked",
        ]);
        expect(capture.mock.calls[1][1]).toMatchObject({
            action_kind: "query", navigation_kind: "in_app", outcome: "results", elapsed_ms: 850,
            visibility_state: "foreground",
        });
        expect(capture.mock.calls[2][1].journey_id).toBe(capture.mock.calls[1][1].journey_id);
        expect(JSON.stringify(capture.mock.calls)).not.toContain("private phrase");
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

    it("normalizes equivalent result keys but rejects results from a different query", async () => {
        const { beginSearchJourney, settleSearchJourney } = await import("@/lib/search-journey-measurement");

        beginSearchJourney("/search?q=phrase&type=book", "query", "submit");
        window.history.pushState(null, "", "/search?type=book&q=phrase&sort=recent");
        settleSearchJourney({ searchKey: "/search?q=other&type=book", outcome: "results", resultCount: 4, filtersCount: 1, queryPresent: true });
        expect(capture).toHaveBeenCalledTimes(1);
        settleSearchJourney({ searchKey: "/search?q=phrase&type=book", outcome: "results", resultCount: 2, filtersCount: 1, queryPresent: true });
        expect(capture.mock.calls[1][1]).toMatchObject({ result_count: 2, outcome: "results" });
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

        expect(capture.mock.calls[1][1]).toMatchObject({ visibility_state: "backgrounded" });
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
