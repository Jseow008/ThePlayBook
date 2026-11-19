import { render, screen } from "@testing-library/react";
import LoginPage from "@/app/login/page";

const { getUserMock, redirectMock } = vi.hoisted(() => ({
    getUserMock: vi.fn(),
    redirectMock: vi.fn((path: string) => {
        throw new Error(`NEXT_REDIRECT:${path}`);
    }),
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode }) => (
        <a href={typeof href === "string" ? href : String(href)} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("next/navigation", () => ({
    redirect: redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({
        auth: {
            getUser: getUserMock,
        },
    })),
}));

vi.mock("@/components/ui/AuthForm", () => ({
    AuthForm: ({ nextUrl }: { nextUrl?: string }) => (
        <div data-testid="auth-form" data-next-url={nextUrl} />
    ),
}));

describe("LoginPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    });

    it.each([
        undefined, "/notes?ask=1", "/ask", "/profile", "/admin", "/auth/callback",
        "//example.com/read/123", "https://example.com/preview/123",
    ])("falls back to Browse from sign-in with next=%s", async (next) => {
        const page = await LoginPage({
            searchParams: Promise.resolve({ next }),
        });

        render(page);

        expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/browse");
    });

    it.each([
        ["/read/123/summary?source=library#audio-player", "/read/123/summary?source=library#audio-player"],
        ["/preview/123#top", "/preview/123#top"],
        ["/read/123?resumeReflection=1&source=library#top", "/read/123?source=library#top"],
        ["/notes?ask=1", "/browse"],
    ])("returns from %s to %s while preserving next for auth", async (next, back) => {
        render(await LoginPage({ searchParams: Promise.resolve({ next }) }));

        expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", back);
        expect(screen.getByTestId("auth-form")).toHaveAttribute("data-next-url", next);
    });

    it("redirects authenticated users to the normalized next target", async () => {
        getUserMock.mockResolvedValue({
            data: { user: { id: "user-1" } },
            error: null,
        });

        await expect(LoginPage({
            searchParams: Promise.resolve({ next: "/settings" }),
        })).rejects.toThrow("NEXT_REDIRECT:/settings");
        expect(redirectMock).toHaveBeenCalledWith("/settings");
    });
});
