import { beforeEach, describe, expect, it, vi } from "vitest";

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

    it("matches the latest query action to painted results without sending query text", async () => {
        const { beginSearchJourney, settleSearchJourney, trackSearchResultClick } = await import("@/lib/search-journey-measurement");

        beginSearchJourney("/search?q=private+phrase", "query", "submit");
        window.history.pushState(null, "", "/search?q=private+phrase");
        vi.mocked(performance.now).mockReturnValue(1850);
        settleSearchJourney({ outcome: "results", resultCount: 2, filtersCount: 0, queryPresent: true });
        trackSearchResultClick(1);

        expect(capture.mock.calls.map(([event]) => event)).toEqual([
            "search_action_started", "search_journey_settled", "search_result_clicked",
        ]);
        expect(capture.mock.calls[1][1]).toMatchObject({
            action_kind: "query", navigation_kind: "in_app", outcome: "results", elapsed_ms: 850,
        });
        expect(capture.mock.calls[2][1].journey_id).toBe(capture.mock.calls[1][1].journey_id);
        expect(JSON.stringify(capture.mock.calls)).not.toContain("private phrase");
        expect(JSON.stringify(capture.mock.calls)).not.toContain("private+phrase");
    });

    it("does not assign stale results to a newer filter action", async () => {
        const { beginSearchJourney, settleSearchJourney } = await import("@/lib/search-journey-measurement");

        beginSearchJourney("/search?type=book", "filter", "link");
        beginSearchJourney("/search?type=podcast", "filter", "link");
        window.history.pushState(null, "", "/search?type=book");
        settleSearchJourney({ outcome: "no_results", resultCount: 0, filtersCount: 1, queryPresent: false });
        expect(capture.mock.calls.map(([event]) => event)).toEqual(["search_action_started", "search_action_started"]);

        window.history.pushState(null, "", "/search?type=podcast");
        settleSearchJourney({ outcome: "no_results", resultCount: 0, filtersCount: 1, queryPresent: false });
        expect(capture.mock.calls[2][1]).toMatchObject({ action_kind: "filter", filter_kind: "type", outcome: "no_results" });
        expect(capture.mock.calls[2][1].journey_id).toBe(capture.mock.calls[1][1].journey_id);
    });

    it("records a direct document load once and keeps failures distinct", async () => {
        window.history.replaceState(null, "", "/search?q=broken");
        vi.mocked(performance.getEntriesByType).mockReturnValue([{
            name: window.location.href,
        } as PerformanceNavigationTiming]);
        const { settleSearchJourney } = await import("@/lib/search-journey-measurement");

        settleSearchJourney({ outcome: "failed", resultCount: 0, filtersCount: 0, queryPresent: true });
        settleSearchJourney({ outcome: "failed", resultCount: 0, filtersCount: 0, queryPresent: true });

        expect(capture).toHaveBeenCalledTimes(1);
        expect(capture.mock.calls[0][1]).toMatchObject({
            action_kind: "initial_load", navigation_kind: "document", outcome: "failed", elapsed_ms: 1000,
        });
    });
});
