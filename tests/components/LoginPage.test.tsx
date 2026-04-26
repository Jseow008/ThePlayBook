import { render, screen } from "@testing-library/react";
import LoginPage from "@/app/login/page";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode }) => (
        <a href={typeof href === "string" ? href : String(href)} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("@/components/ui/AuthForm", () => ({
    AuthForm: ({ nextUrl }: { nextUrl?: string }) => (
        <div data-testid="auth-form" data-next-url={nextUrl} />
    ),
}));

describe("LoginPage", () => {
    it("sends the Back link to browse while preserving next for auth", async () => {
        const page = await LoginPage({
            searchParams: Promise.resolve({ next: "/notes?ask=1" }),
        });

        render(page);

        expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/browse");
        expect(screen.getByTestId("auth-form")).toHaveAttribute("data-next-url", "/notes?ask=1");
    });
});
