import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostHogPageviewTracker } from "@/components/providers/PostHogPageviewTracker";

const {
    captureAnalyticsPageviewMock,
    identifyAnalyticsUserMock,
    resetAnalyticsUserMock,
    getUserMock,
    onAuthStateChangeMock,
    maybeSingleMock,
    unsubscribeMock,
} = vi.hoisted(() => ({
    captureAnalyticsPageviewMock: vi.fn(),
    identifyAnalyticsUserMock: vi.fn(),
    resetAnalyticsUserMock: vi.fn(),
    getUserMock: vi.fn(),
    onAuthStateChangeMock: vi.fn(),
    maybeSingleMock: vi.fn(),
    unsubscribeMock: vi.fn(),
}));

let authStateCallback: ((event: string, session: { user: { id: string } } | null) => void) | null = null;

vi.mock("next/navigation", () => ({
    usePathname: () => "/browse",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/analytics", () => ({
    captureAnalyticsPageview: captureAnalyticsPageviewMock,
    identifyAnalyticsUser: identifyAnalyticsUserMock,
    resetAnalyticsUser: resetAnalyticsUserMock,
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            getUser: getUserMock,
            onAuthStateChange: onAuthStateChangeMock,
        },
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: maybeSingleMock,
                }),
            }),
        }),
    }),
}));

describe("PostHogPageviewTracker", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authStateCallback = null;
        getUserMock.mockResolvedValue({
            data: { user: null },
            error: null,
        });
        maybeSingleMock.mockResolvedValue({
            data: null,
            error: null,
        });
        onAuthStateChangeMock.mockImplementation((callback) => {
            authStateCallback = callback;

            return {
                data: {
                    subscription: {
                        unsubscribe: unsubscribeMock,
                    },
                },
            };
        });
    });

    it("identifies authenticated users with safe profile traits", async () => {
        getUserMock.mockResolvedValue({
            data: { user: { id: "user-1" } },
            error: null,
        });
        maybeSingleMock.mockResolvedValue({
            data: {
                role: "admin",
                is_internal: true,
            },
            error: null,
        });

        render(<PostHogPageviewTracker />);

        await waitFor(() => {
            expect(identifyAnalyticsUserMock).toHaveBeenCalledWith("user-1", {
                account_role: "admin",
                is_internal: true,
                profile_available: true,
            });
        });
        expect(captureAnalyticsPageviewMock).toHaveBeenCalledWith({
            path: "/browse",
            search_present: false,
            user_state: "authenticated",
            content_id: undefined,
        });
    });

    it("resets analytics identity after sign-out", async () => {
        getUserMock.mockResolvedValue({
            data: { user: { id: "user-1" } },
            error: null,
        });

        render(<PostHogPageviewTracker />);

        await waitFor(() => {
            expect(identifyAnalyticsUserMock).toHaveBeenCalledWith("user-1", {
                account_role: "user",
                is_internal: false,
                profile_available: false,
            });
        });

        await act(async () => {
            authStateCallback?.("SIGNED_OUT", null);
        });

        await waitFor(() => {
            expect(resetAnalyticsUserMock).toHaveBeenCalledTimes(1);
        });
    });
});
