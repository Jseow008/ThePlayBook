import { describe, expect, it, vi } from "vitest";

const posthogCapture = vi.hoisted(() => vi.fn());
vi.mock("posthog-js", () => ({ default: { capture: posthogCapture } }));

import { captureAnalyticsEvent } from "@/lib/analytics";

describe("Search analytics URL privacy", () => {
    it("overrides the browser URL so a query is not sent with Search events", () => {
        window.history.replaceState(null, "", "/search?q=private+phrase");
        captureAnalyticsEvent("search_action_started", {
            source: "search_results",
            route: "/search",
            journey_id: "test-journey",
            action_kind: "query",
            trigger: "submit",
            query_present: true,
        });
        captureAnalyticsEvent("search_action_superseded", {
            source: "search_results",
            route: "/search",
            journey_id: "test-journey",
            action_kind: "query",
        });

        expect(posthogCapture).toHaveBeenCalledWith("search_action_started", expect.objectContaining({
            $current_url: `${window.location.origin}/search`,
        }));
        expect(posthogCapture).toHaveBeenCalledWith("search_action_superseded", expect.objectContaining({
            $current_url: `${window.location.origin}/search`,
        }));
        expect(JSON.stringify(posthogCapture.mock.calls)).not.toContain("private");
    });
});
