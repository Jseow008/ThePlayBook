import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeActivation } from "@/components/ui/WelcomeActivation";
import { APP_ONBOARDING_TOUR_KEY, APP_ONBOARDING_VERSION } from "@/lib/onboarding";

const { replaceMock, rpcMock, toastErrorMock } = vi.hoisted(() => ({
    replaceMock: vi.fn(),
    rpcMock: vi.fn(),
    toastErrorMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({ rpc: rpcMock }),
}));

vi.mock("sonner", () => ({
    toast: { error: toastErrorMock },
}));

describe("WelcomeActivation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        rpcMock.mockResolvedValue({ error: null });
    });

    it("marks activation complete before opening the requested destination", async () => {
        render(<WelcomeActivation nextUrl="/notes?ask=1" />);

        await userEvent.click(screen.getByRole("button", { name: /explore the library/i }));

        await waitFor(() => {
            expect(rpcMock).toHaveBeenCalledWith("set_onboarding_state", {
                p_tour: APP_ONBOARDING_TOUR_KEY,
                p_version: APP_ONBOARDING_VERSION,
                p_status: "completed",
            });
            expect(replaceMock).toHaveBeenCalledWith("/notes?ask=1");
        });
    });

    it("keeps the user on welcome when activation cannot be saved", async () => {
        rpcMock.mockResolvedValue({ error: new Error("Database unavailable") });
        render(<WelcomeActivation nextUrl="/browse" />);

        await userEvent.click(screen.getByRole("button", { name: /explore the library/i }));

        await waitFor(() => {
            expect(toastErrorMock).toHaveBeenCalledWith("We couldn't save your progress. Please try again.");
        });
        expect(replaceMock).not.toHaveBeenCalled();
    });
});
