import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "@/components/ui/AuthForm";

const { signInWithOtpMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
    signInWithOtpMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            signInWithOtp: signInWithOtpMock,
            signInWithOAuth: vi.fn(),
        },
    }),
}));

vi.mock("sonner", () => ({
    toast: {
        error: toastErrorMock,
        success: toastSuccessMock,
    },
}));

describe("AuthForm", () => {
    beforeEach(() => {
        signInWithOtpMock.mockReset();
        toastErrorMock.mockReset();
        toastSuccessMock.mockReset();
        signInWithOtpMock.mockResolvedValue({ error: null });
    });

    it("creates a new Supabase user when requesting an email magic link", async () => {
        render(<AuthForm nextUrl="/notes?ask=1" />);

        await userEvent.type(screen.getByLabelText(/email address/i), " reader@example.com ");
        await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));

        await waitFor(() => {
            expect(signInWithOtpMock).toHaveBeenCalledWith({
                email: "reader@example.com",
                options: {
                    emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fnotes%3Fask%3D1",
                    shouldCreateUser: true,
                },
            });
        });
    });

    it("does not show Apple sign in while the provider is unavailable", () => {
        render(<AuthForm />);

        expect(screen.queryByRole("button", { name: /sign in with apple/i })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /sign in with google/i })).toBeVisible();
    });

    it("shows a clear message when email signup is unavailable", async () => {
        signInWithOtpMock.mockResolvedValue({
            error: {
                status: 422,
                message: "Signups not allowed for otp",
            },
        });

        render(<AuthForm />);

        await userEvent.type(screen.getByLabelText(/email address/i), "new@example.com");
        await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));

        await waitFor(() => {
            expect(toastErrorMock).toHaveBeenCalledWith(
                "Email sign-up is unavailable right now. Please try Google or try again later."
            );
        });
    });
});
