import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandingRedirectGuard } from "@/components/ui/LandingRedirectGuard";

const { routerReplaceMock, getUserMock } = vi.hoisted(() => ({
    routerReplaceMock: vi.fn(),
    getUserMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        replace: routerReplaceMock,
    }),
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            getUser: getUserMock,
        },
    }),
}));

describe("LandingRedirectGuard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("redirects authenticated users to browse after hydration", async () => {
        getUserMock.mockResolvedValue({
            data: { user: { id: "user-1" } },
            error: null,
        });

        render(<LandingRedirectGuard />);

        await waitFor(() => {
            expect(routerReplaceMock).toHaveBeenCalledWith("/browse");
        });
    });

    it("does not redirect guests", async () => {
        getUserMock.mockResolvedValue({
            data: { user: null },
            error: null,
        });

        render(<LandingRedirectGuard />);

        await waitFor(() => {
            expect(getUserMock).toHaveBeenCalledTimes(1);
        });
        expect(routerReplaceMock).not.toHaveBeenCalled();
    });
});
