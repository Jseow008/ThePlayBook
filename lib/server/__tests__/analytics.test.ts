import { beforeEach, expect, it, vi } from "vitest";

const { capture, flush, PostHog } = vi.hoisted(() => {
    const capture = vi.fn();
    const flush = vi.fn();
    return { capture, flush, PostHog: vi.fn(function () { return { capture, flush }; }) };
});
vi.mock("server-only", () => ({}));
vi.mock("posthog-node", () => ({ PostHog }));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "test-token");
    flush.mockResolvedValue(undefined);
});

it("reuses the client while concurrent events retain distinct identities", async () => {
    const { captureServerAnalyticsEvent } = await import("../analytics");
    await Promise.all(["user-a", "user-b"].map((distinctId) => captureServerAnalyticsEvent({
        event: "signup_completed", distinctId,
        properties: { source: "auth_callback", route: "/auth/callback", user_state: "authenticated" },
    })));
    expect(PostHog).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls.map(([event]) => event.distinctId)).toEqual(["user-a", "user-b"]);
});

it("isolates telemetry failure from the user operation", async () => {
    const { captureServerAnalyticsEvent } = await import("../analytics");
    flush.mockRejectedValue(new Error("offline"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(captureServerAnalyticsEvent({
        event: "signup_completed", distinctId: "user-a",
        properties: { source: "auth_callback", route: "/auth/callback", user_state: "authenticated" },
    })).resolves.toBeUndefined();
    warning.mockRestore();
});
