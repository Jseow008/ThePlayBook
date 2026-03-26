import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileHeader } from "@/components/ui/MobileHeader";

const { pathnameState } = vi.hoisted(() => ({
    pathnameState: { value: "/browse" },
}));

vi.mock("next/navigation", () => ({
    usePathname: () => pathnameState.value,
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

        expect(container.firstChild).toHaveClass("-translate-y-full");

        pathnameState.value = "/search";
        rerender(<MobileHeader />);

        expect(container.firstChild).toHaveClass("translate-y-0");
    });

    it("returns null on immersive read routes", () => {
        pathnameState.value = "/read/test-item-1";

        const { container } = render(<MobileHeader />);

        expect(container.firstChild).toBeNull();
        expect(screen.queryByTestId("user-nav")).not.toBeInTheDocument();
    });
});
