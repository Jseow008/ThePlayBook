import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeActivation, type WelcomeContentItem } from "@/components/ui/WelcomeActivation";
import { APP_ONBOARDING_TOUR_KEY, APP_ONBOARDING_VERSION } from "@/lib/onboarding";

const { replaceMock, rpcMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
    replaceMock: vi.fn(),
    rpcMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({ rpc: rpcMock }),
}));

vi.mock("sonner", () => ({
    toast: { error: toastErrorMock, success: toastSuccessMock },
}));

const items: WelcomeContentItem[] = [
    { id: "11111111-1111-4111-8111-111111111111", title: "The Psychology of Money", author: "Morgan Housel", category: "Psychology", cover_image_url: null, type: "book" },
    { id: "22222222-2222-4222-8222-222222222222", title: "Thinking in Systems", author: "Donella Meadows", category: "Business", cover_image_url: null, type: "book" },
    { id: "33333333-3333-4333-8333-333333333333", title: "Deep Work", author: "Cal Newport", category: "Creativity", cover_image_url: null, type: "book" },
];

describe("WelcomeActivation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        rpcMock.mockResolvedValue({ error: null });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    });

    afterEach(() => vi.unstubAllGlobals());

    it("requires interests before showing the starter shelf", async () => {
        render(<WelcomeActivation nextUrl="/browse" items={items} />);

        const continueButton = screen.getByRole("button", { name: /see your starter shelf/i });
        expect(continueButton).toBeDisabled();

        await userEvent.click(screen.getByRole("button", { name: "Psychology" }));
        await userEvent.click(screen.getByRole("button", { name: "Business" }));
        expect(continueButton).toBeEnabled();

        await userEvent.click(continueButton);
        expect(screen.getByText(/save a few ideas to return to/i)).toBeInTheDocument();
    });

    it("saves three items then hands the suggested question to Ask My Library", async () => {
        render(<WelcomeActivation nextUrl="/browse" items={items} />);

        await userEvent.click(screen.getByRole("button", { name: "Psychology" }));
        await userEvent.click(screen.getByRole("button", { name: "Business" }));
        await userEvent.click(screen.getByRole("button", { name: /see your starter shelf/i }));

        const saveButtons = screen.getAllByRole("button", { name: /^save$/i });
        for (const button of saveButtons) await userEvent.click(button);

        await waitFor(() => expect(screen.getByRole("button", { name: /try ask my library/i })).toBeEnabled());
        expect(fetch).toHaveBeenCalledTimes(3);

        await userEvent.click(screen.getByRole("button", { name: /try ask my library/i }));
        await userEvent.click(screen.getByRole("button", { name: /open ask my library/i }));

        await waitFor(() => {
            expect(rpcMock).toHaveBeenCalledWith("set_onboarding_state", {
                p_tour: APP_ONBOARDING_TOUR_KEY,
                p_version: APP_ONBOARDING_VERSION,
                p_status: "completed",
            });
            expect(replaceMock).toHaveBeenCalledWith("/ask?prompt=What%20themes%20connect%20the%20summaries%20I%20just%20saved%3F");
        });
    });

    it("keeps the user on welcome when activation cannot be saved", async () => {
        rpcMock.mockResolvedValue({ error: new Error("Database unavailable") });
        render(<WelcomeActivation nextUrl="/browse" items={items} />);

        await userEvent.click(screen.getByRole("button", { name: /skip for now/i }));

        await waitFor(() => {
            expect(toastErrorMock).toHaveBeenCalledWith("We couldn't save your progress. Please try again.");
        });
        expect(replaceMock).not.toHaveBeenCalled();
    });

    it("uses local-only saves and completion in preview mode", async () => {
        render(<WelcomeActivation nextUrl="/browse" items={items} preview />);

        await userEvent.click(screen.getByRole("button", { name: /skip for now/i }));

        expect(rpcMock).not.toHaveBeenCalled();
        expect(replaceMock).not.toHaveBeenCalled();
        expect(toastSuccessMock).toHaveBeenCalledWith("Preview complete. No changes were saved.");
    });
});
