import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ImgHTMLAttributes, ReactNode } from "react";
import { AppOnboardingGate } from "@/components/ui/AppOnboardingGate";
import { GUEST_ONBOARDING_STORAGE_KEY, createGuestOnboardingEntry } from "@/lib/onboarding";
import { vi } from "vitest";

const {
    authUserState,
    pathnameState,
    profileState,
    routerReplaceMock,
    rpcMock,
    searchParamsState,
    singleMock,
} = vi.hoisted(() => ({
    authUserState: { value: null as { id: string } | null },
    pathnameState: { value: "/browse" },
    profileState: { value: { data: { onboarding_state: null }, error: null } as { data: { onboarding_state: unknown } | null; error: unknown } },
    routerReplaceMock: vi.fn(),
    rpcMock: vi.fn(),
    searchParamsState: { value: "" },
    singleMock: vi.fn(),
}));
const REPLAY_OPEN_DELAY_MS = 1200;

vi.mock("next/navigation", () => ({
    usePathname: () => pathnameState.value,
    useRouter: () => ({ replace: routerReplaceMock }),
    useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock("next/image", () => ({
    default: (props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
        const { alt, src, fill, priority, ...safeProps } = props;
        void fill;
        void priority;
        return <img alt={alt} src={src} {...safeProps} />;
    },
}));

vi.mock("react-dom", async () => {
    const actual = await vi.importActual<typeof import("react-dom")>("react-dom");

    return {
        ...actual,
        createPortal: (node: ReactNode) => node,
    };
});

vi.mock("@/hooks/useAuthUser", () => ({
    useAuthUser: () => authUserState.value,
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: singleMock,
                }),
            }),
        }),
        rpc: rpcMock,
    }),
}));

describe("AppOnboardingGate", () => {
    beforeEach(() => {
        authUserState.value = { id: "user-1" };
        pathnameState.value = "/browse";
        profileState.value = { data: { onboarding_state: null }, error: null };
        searchParamsState.value = "";
        singleMock.mockReset();
        singleMock.mockImplementation(async () => profileState.value);
        rpcMock.mockResolvedValue({ error: null });
        routerReplaceMock.mockReset();
        rpcMock.mockClear();
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("opens the shared tour for a signed-out visitor who has not seen it", async () => {
        authUserState.value = null;

        render(<AppOnboardingGate />);

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Find your next read.")).toBeInTheDocument();
        expect(rpcMock).not.toHaveBeenCalled();
    });

    it("opens the tour for a signed-in user who has not seen it", async () => {
        render(<AppOnboardingGate />);

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Find your next read.")).toBeInTheDocument();
    });

    it("suppresses auto-open when the current version is already seen", async () => {
        profileState.value = {
            data: {
                onboarding_state: {
                    "app-tour": {
                        status: "completed",
                        updated_at: "2026-03-11T00:00:00.000Z",
                        version: "v1",
                    },
                },
            },
            error: null,
        };

        render(<AppOnboardingGate />);

        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    it("opens replay after a short delay even when already seen", async () => {
        vi.useFakeTimers();
        searchParamsState.value = "tour=app-v1";
        profileState.value = {
            data: {
                onboarding_state: {
                    "app-tour": {
                        status: "dismissed",
                        updated_at: "2026-03-11T00:00:00.000Z",
                        version: "v1",
                    },
                },
            },
            error: null,
        };

        render(<AppOnboardingGate />);

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(REPLAY_OPEN_DELAY_MS);
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(singleMock).not.toHaveBeenCalled();
    });

    it("opens replay after the short delay without waiting for the signed-in profile query", async () => {
        vi.useFakeTimers();
        searchParamsState.value = "tour=app-v1";
        singleMock.mockImplementation(() => new Promise(() => undefined));

        render(<AppOnboardingGate />);

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(REPLAY_OPEN_DELAY_MS);
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(singleMock).not.toHaveBeenCalled();
    });

    it("opens guest replay after the short delay even when the guest tour was already seen", async () => {
        vi.useFakeTimers();
        authUserState.value = null;
        searchParamsState.value = "tour=app-v1";
        window.localStorage.setItem(
            GUEST_ONBOARDING_STORAGE_KEY,
            JSON.stringify(createGuestOnboardingEntry("completed"))
        );

        render(<AppOnboardingGate />);

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(REPLAY_OPEN_DELAY_MS);
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(singleMock).not.toHaveBeenCalled();
    });

    it("persists dismissal and clears the replay query param after closing", async () => {
        vi.useFakeTimers();
        searchParamsState.value = "tour=app-v1";

        render(<AppOnboardingGate />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(REPLAY_OPEN_DELAY_MS);
        });
        fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
        await act(async () => {});

        expect(rpcMock).toHaveBeenCalledWith("set_onboarding_state", {
            p_status: "dismissed",
            p_tour: "app-tour",
            p_version: "v1",
        });

        expect(routerReplaceMock).toHaveBeenCalledWith("/browse", { scroll: false });
    });

    it("persists replay dismissal to the account once auth resolves while the tour is open", async () => {
        vi.useFakeTimers();
        authUserState.value = null;
        searchParamsState.value = "tour=app-v1";

        const { rerender } = render(<AppOnboardingGate />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(REPLAY_OPEN_DELAY_MS);
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(rpcMock).not.toHaveBeenCalled();

        authUserState.value = { id: "user-1" };
        rerender(<AppOnboardingGate />);

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
        await act(async () => {});

        expect(rpcMock).toHaveBeenCalledWith("set_onboarding_state", {
            p_status: "dismissed",
            p_tour: "app-tour",
            p_version: "v1",
        });

        expect(window.localStorage.getItem(GUEST_ONBOARDING_STORAGE_KEY)).toBeFalsy();
        expect(routerReplaceMock).toHaveBeenCalledWith("/browse", { scroll: false });
    });

    it("persists guest dismissal locally without calling the account RPC", async () => {
        authUserState.value = null;

        render(<AppOnboardingGate />);

        fireEvent.click(await screen.findByRole("button", { name: "Skip tour" }));

        await waitFor(() => {
            expect(window.localStorage.getItem(GUEST_ONBOARDING_STORAGE_KEY)).not.toBeNull();
        });

        expect(rpcMock).not.toHaveBeenCalled();
    });

    it("still opens the signed-in tour after login even if the guest local state was seen", async () => {
        window.localStorage.setItem(
            GUEST_ONBOARDING_STORAGE_KEY,
            JSON.stringify(createGuestOnboardingEntry("completed"))
        );

        render(<AppOnboardingGate />);

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Find your next read.")).toBeInTheDocument();
    });
});
