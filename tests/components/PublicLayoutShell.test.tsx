import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicLayoutShell } from "@/components/ui/PublicLayoutShell";

const { pathnameState } = vi.hoisted(() => ({
    pathnameState: { value: "/browse" },
}));

vi.mock("next/navigation", () => ({
    usePathname: () => pathnameState.value,
}));

vi.mock("@/components/ui/NetflixSidebar", () => ({
    NetflixSidebar: () => <aside data-testid="sidebar" />,
}));

vi.mock("@/components/ui/UserNav", () => ({
    UserNav: () => <div data-testid="user-nav" />,
}));

vi.mock("@/components/ui/MobileBottomNav", () => ({
    MobileBottomNav: () => <nav data-testid="mobile-bottom-nav" />,
}));

vi.mock("@/components/ui/MobileHeader", () => ({
    MobileHeader: () => (pathnameState.value.startsWith("/read") ? null : <header data-testid="mobile-header" />),
}));

vi.mock("@/components/ui/AppOnboardingGate", () => ({
    AppOnboardingGate: () => <div data-testid="onboarding-gate" />,
}));

describe("PublicLayoutShell", () => {
    beforeEach(() => {
        pathnameState.value = "/browse";
    });

    it("keeps the focus shell without the mobile header", () => {
        pathnameState.value = "/focus";

        const { container } = render(
            <PublicLayoutShell>
                <div>Focus content</div>
            </PublicLayoutShell>
        );

        const main = container.querySelector("main");

        expect(screen.getByTestId("sidebar")).toBeInTheDocument();
        expect(screen.getByTestId("user-nav")).toBeInTheDocument();
        expect(screen.queryByTestId("mobile-header")).not.toBeInTheDocument();
        expect(screen.getByTestId("mobile-bottom-nav")).toBeInTheDocument();
        expect(screen.getByText("Focus content")).toBeInTheDocument();
        expect(main).toHaveClass("lg:pl-16");
        expect(main).toHaveClass("h-full");
        expect(main).toHaveClass("overflow-hidden");
        expect(main).not.toHaveClass("pb-[calc(4rem+env(safe-area-inset-bottom))]");
        expect(main).not.toHaveClass("pb-[calc(3.5rem+env(safe-area-inset-bottom))]");
        expect(container.firstElementChild).toHaveClass("h-[100dvh]");
        expect(container.firstElementChild).toHaveClass("overflow-hidden");
    });

    it("suppresses the mobile chrome on immersive read routes", () => {
        pathnameState.value = "/read/test-item-1";

        const { container } = render(
            <PublicLayoutShell>
                <div>Reader content</div>
            </PublicLayoutShell>
        );

        const main = container.querySelector("main");

        expect(screen.getByTestId("sidebar")).toBeInTheDocument();
        expect(screen.getByTestId("user-nav")).toBeInTheDocument();
        expect(screen.queryByTestId("mobile-header")).not.toBeInTheDocument();
        expect(screen.queryByTestId("mobile-bottom-nav")).not.toBeInTheDocument();
        expect(screen.getByText("Reader content")).toBeInTheDocument();
        expect(main).toHaveClass("lg:pl-16");
        expect(main).not.toHaveClass("pb-[calc(4rem+env(safe-area-inset-bottom))]");
        expect(main).not.toHaveClass("pb-[calc(3.5rem+env(safe-area-inset-bottom))]");
    });

    it("suppresses the mobile chrome on ask routes so ask can own the viewport", () => {
        pathnameState.value = "/ask";

        const { container } = render(
            <PublicLayoutShell>
                <div>Ask content</div>
            </PublicLayoutShell>
        );

        const main = container.querySelector("main");

        expect(screen.getByTestId("sidebar")).toBeInTheDocument();
        expect(screen.getByTestId("user-nav")).toBeInTheDocument();
        expect(screen.queryByTestId("mobile-header")).not.toBeInTheDocument();
        expect(screen.queryByTestId("mobile-bottom-nav")).not.toBeInTheDocument();
        expect(screen.getByText("Ask content")).toBeInTheDocument();
        expect(main).toHaveClass("lg:pl-16");
        expect(main).not.toHaveClass("pb-[calc(4rem+env(safe-area-inset-bottom))]");
        expect(main).not.toHaveClass("pb-[calc(3.5rem+env(safe-area-inset-bottom))]");
    });
});
