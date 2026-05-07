import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "@/components/ui/AuthForm";

const signInWithOtpMock = vi.fn();

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
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe("AuthForm", () => {
    beforeEach(() => {
        signInWithOtpMock.mockReset();
        signInWithOtpMock.mockResolvedValue({ error: null });
    });

    it("does not create a new Supabase user when requesting an email magic link", async () => {
        render(<AuthForm nextUrl="/notes?ask=1" />);

        await userEvent.type(screen.getByLabelText(/email address/i), " reader@example.com ");
        await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));

        await waitFor(() => {
            expect(signInWithOtpMock).toHaveBeenCalledWith({
                email: "reader@example.com",
                options: {
                    emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fnotes%3Fask%3D1",
                    shouldCreateUser: false,
                },
            });
        });
    });

    it("does not show Apple sign in while the provider is unavailable", () => {
        render(<AuthForm />);

        expect(screen.queryByRole("button", { name: /sign in with apple/i })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /sign in with google/i })).toBeVisible();
    });
});
