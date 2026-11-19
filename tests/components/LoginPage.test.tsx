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

    it("sends the Back link to browse while preserving next for auth", async () => {
        const page = await LoginPage({
            searchParams: Promise.resolve({ next: "/notes?ask=1" }),
        });

        render(page);

        expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/browse");
        expect(screen.getByTestId("auth-form")).toHaveAttribute("data-next-url", "/notes?ask=1");
    });

    it("returns guests to the complete Search URL while keeping Notes as the sign-in destination", async () => {
        const backTo = "/search?q=God&type=book&category=Faith&cursor=abc%2B1";
        render(await LoginPage({ searchParams: Promise.resolve({ next: "/notes", backTo }) }));

        expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", backTo);
        expect(screen.getByTestId("auth-form")).toHaveAttribute("data-next-url", "/notes");
    });

    it.each(["https://example.org/search", "//example.org/search", "/settings", "/searching"])(
        "falls back to Browse for an invalid Back destination %s", async (backTo) => {
            render(await LoginPage({ searchParams: Promise.resolve({ next: "/notes", backTo }) }));
            expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/browse");
        },
    );

    it("redirects authenticated users to the normalized next target", async () => {
        getUserMock.mockResolvedValue({
            data: { user: { id: "user-1" } },
            error: null,
        });

        await expect(LoginPage({
            searchParams: Promise.resolve({ next: "/settings", backTo: "/search?q=God" }),
        })).rejects.toThrow("NEXT_REDIRECT:/settings");
        expect(redirectMock).toHaveBeenCalledWith("/settings");
    });
});
