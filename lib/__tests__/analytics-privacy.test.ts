import { describe, expect, it, vi } from "vitest";
import type { PostHog } from "posthog-js";
import { sanitizeAnalyticsMetadata, sanitizeAnalyticsPersistence } from "@/lib/analytics-privacy";

describe("analytics metadata privacy", () => {
  it("removes nested query URLs and text while retaining attribution and identity", () => {
    expect(sanitizeAnalyticsMetadata({
      distinct_id: "same-user", $session_id: "same-session",
      $current_url: "https://www.netflux.blog/search?q=private+term&type=book#secret",
      $set_once: { $initial_current_url: "https://www.netflux.blog/search?q=private%20term&utm_source=email" },
      $client_session_props: { props: { u: "/search?q=private+term", r: "https://www.netflux.blog/search?q=private" } },
      query_text: "private term",
    })).toEqual({
      distinct_id: "same-user", $session_id: "same-session",
      $current_url: "https://www.netflux.blog/search?type=book",
      $set_once: { $initial_current_url: "https://www.netflux.blog/search?utm_source=email" },
      $client_session_props: { props: { u: "/search", r: "https://www.netflux.blog/search" } },
    });
  });

  it("repairs returning-visitor persistence without resetting identity or writing clean data again", () => {
    const props: Record<string, unknown> = { distinct_id: "same-user", $initial_person_info: { u: "https://www.netflux.blog/search?q=old" } };
    const persistence = { props, unregister: vi.fn(), register: vi.fn((clean) => Object.assign(props, clean)) };
    const analytics = { persistence } as unknown as PostHog;
    sanitizeAnalyticsPersistence(analytics);
    expect(props).toEqual({ distinct_id: "same-user", $initial_person_info: { u: "https://www.netflux.blog/search" } });
    sanitizeAnalyticsPersistence(analytics);
    expect(persistence.register).toHaveBeenCalledTimes(1);
  });
});
