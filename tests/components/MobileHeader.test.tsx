import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileHeader } from "@/components/ui/MobileHeader";

const { pathnameState, routerBack, routerPush } = vi.hoisted(() => ({
    pathnameState: { value: "/browse" },
    routerBack: vi.fn(),
    routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => pathnameState.value,
    useRouter: () => ({
        back: routerBack,
        push: routerPush,
    }),
}));

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: React.ReactNode;
        href: string;
    } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("@/components/ui/UserNav", () => ({
    UserNav: () => <div data-testid="user-nav" />,
}));

vi.mock("@/components/ui/Logo", () => ({
    Logo: () => <div data-testid="logo" />,
}));

describe("MobileHeader", () => {
    beforeEach(() => {
        pathnameState.value = "/browse";
        routerBack.mockReset();
        routerPush.mockReset();
        Object.defineProperty(window, "scrollY", {
            value: 0,
            writable: true,
            configurable: true,
        });
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    });

    it("resets visibility when the route changes", () => {
        const { container, rerender } = render(<MobileHeader />);

        window.scrollY = 120;
        fireEvent.scroll(window);

        expect(container.firstChild).toHaveStyle({ transform: "translateY(-100%)" });

        pathnameState.value = "/search";
        rerender(<MobileHeader />);

        expect(container.firstChild).toHaveStyle({ transform: "translateY(0)" });
    });

    it("replaces the logo with a labeled back button on read routes", () => {
        pathnameState.value = "/read/test-item-1";

        const { container } = render(<MobileHeader />);

        expect(container.firstChild).not.toBeNull();
        expect(screen.getByRole("button", { name: "Go back" })).toHaveTextContent("Back");
        expect(screen.queryByTestId("logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("user-nav")).toBeInTheDocument();
    });

    it("shows the labeled back button on preview routes", () => {
        pathnameState.value = "/preview/test-item-1";

        render(<MobileHeader />);

        expect(screen.getByRole("button", { name: "Go back" })).toHaveTextContent("Back");
        expect(screen.queryByTestId("logo")).not.toBeInTheDocument();
    });

    it("keeps the logo on standard routes", () => {
        render(<MobileHeader />);

        expect(screen.getByTestId("logo")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Go back" })).not.toBeInTheDocument();
    });
});
