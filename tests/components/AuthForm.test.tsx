import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "@/components/ui/AuthForm";

const { signInWithOtpMock, toastErrorMock, toastSuccessMock, fetchMock } = vi.hoisted(() => ({
    signInWithOtpMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    fetchMock: vi.fn(),
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
        vi.stubGlobal("fetch", fetchMock);
        signInWithOtpMock.mockReset();
        toastErrorMock.mockReset();
        toastSuccessMock.mockReset();
        fetchMock.mockReset();
        signInWithOtpMock.mockResolvedValue({ error: null });
    });

    it("creates a new Supabase user and asks them for a verification code", async () => {
        render(<AuthForm nextUrl="/notes?ask=1" />);

        await userEvent.type(screen.getByLabelText(/email address/i), " reader@example.com ");
        await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));

        await waitFor(() => {
            expect(signInWithOtpMock).toHaveBeenCalledWith({
                email: "reader@example.com",
                options: {
                    shouldCreateUser: true,
                },
            });
        });

        expect(screen.getByRole("heading", { name: /enter your code/i })).toBeVisible();
        expect(screen.getByLabelText(/verification code/i)).toBeVisible();
    });

    it("verifies the code and preserves the intended redirect", async () => {
        fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ next: "/notes?ask=1" }) });
        const assignMock = vi.fn();
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, assign: assignMock },
        });

        render(<AuthForm nextUrl="/notes?ask=1" />);
        await userEvent.type(screen.getByLabelText(/email address/i), "reader@example.com");
        await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));
        await userEvent.type(screen.getByLabelText(/verification code/i), "123456");
        await userEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith("/api/auth/otp/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: "reader@example.com", token: "123456", next: "/notes?ask=1" }),
            });
            expect(assignMock).toHaveBeenCalledWith("/notes?ask=1");
        });
    });

    it("does not show Apple sign in while the provider is unavailable", () => {
        render(<AuthForm />);

        expect(screen.queryByRole("button", { name: /sign in with apple/i })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /continue with google/i })).toBeVisible();
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
