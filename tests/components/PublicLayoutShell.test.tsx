import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicLayoutShell } from "@/components/ui/PublicLayoutShell";

const { pathnameState } = vi.hoisted(() => ({
    pathnameState: { value: "/browse" },
}));

vi.mock("next/navigation", () => ({
    usePathname: () => pathnameState.value,
}));

vi.mock("@/components/ui/NetfluxSidebar", () => ({
    NetfluxSidebar: () => <aside data-testid="sidebar" />,
}));

vi.mock("@/components/ui/UserNav", () => ({
    UserNav: () => <div data-testid="user-nav" />,
}));

vi.mock("@/components/ui/MobileBottomNav", () => ({
    MobileBottomNav: ({ compact }: { compact?: boolean }) => (
        <nav data-testid="mobile-bottom-nav" data-compact={compact ? "true" : "false"} />
    ),
}));

vi.mock("@/components/ui/MobileHeader", () => ({
    MobileHeader: ({ compact }: { compact?: boolean }) => (
        <header data-testid="mobile-header" data-compact={compact ? "true" : "false"} />
    ),
}));

vi.mock("@/components/ui/AppOnboardingGate", () => ({
    AppOnboardingGate: () => <div data-testid="onboarding-gate" />,
}));

describe("PublicLayoutShell", () => {
    beforeEach(() => {
        pathnameState.value = "/browse";
    });

    it("renders landing as a standalone page without app chrome", () => {
        pathnameState.value = "/";

        render(
            <PublicLayoutShell>
                <div>Landing content</div>
            </PublicLayoutShell>
        );

        expect(screen.getByText("Landing content")).toBeInTheDocument();
        expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
        expect(screen.queryByTestId("user-nav")).not.toBeInTheDocument();
        expect(screen.queryByTestId("mobile-header")).not.toBeInTheDocument();
        expect(screen.queryByTestId("mobile-bottom-nav")).not.toBeInTheDocument();
    });

    it("uses compact mobile chrome on browse", () => {
        pathnameState.value = "/browse";

        const { container } = render(
            <PublicLayoutShell>
                <div>Browse content</div>
            </PublicLayoutShell>
        );

        const main = container.querySelector("main");

        expect(screen.getByTestId("mobile-header")).toHaveAttribute("data-compact", "true");
        expect(screen.getByTestId("mobile-bottom-nav")).toHaveAttribute("data-compact", "true");
        expect(screen.getByText("Browse content")).toBeInTheDocument();
        expect(main).toHaveClass("lg:pl-16");
        expect(main).toHaveClass("mobile-shell-bottom-padding-compact");
        expect(main).toHaveClass("lg:pb-0");
        expect(main?.firstElementChild).toHaveClass("mobile-header-compact-height");
        expect(container.firstElementChild).toHaveClass("min-h-dvh");
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
        expect(main).not.toHaveClass("mobile-shell-bottom-padding");
        expect(main).not.toHaveClass("mobile-shell-bottom-padding-compact");
        expect(container.firstElementChild).toHaveClass("h-[100dvh]");
        expect(container.firstElementChild).toHaveClass("overflow-hidden");
    });

    it("keeps the mobile header but suppresses bottom nav on read routes", () => {
        pathnameState.value = "/read/test-item-1";

        const { container } = render(
            <PublicLayoutShell>
                <div>Reader content</div>
            </PublicLayoutShell>
        );

        const main = container.querySelector("main");

        expect(screen.getByTestId("sidebar")).toBeInTheDocument();
        expect(screen.getByTestId("user-nav")).toBeInTheDocument();
        expect(screen.getByTestId("mobile-header")).toHaveAttribute("data-compact", "false");
        expect(screen.queryByTestId("mobile-bottom-nav")).not.toBeInTheDocument();
        expect(screen.getByText("Reader content")).toBeInTheDocument();
        expect(main).toHaveClass("lg:pl-16");
        expect(main).not.toHaveClass("mobile-shell-bottom-padding");
        expect(main).not.toHaveClass("mobile-shell-bottom-padding-compact");
        expect(main?.firstElementChild).toHaveClass("mobile-header-height");
    });

    it("keeps the mobile header but suppresses bottom nav on preview routes", () => {
        pathnameState.value = "/preview/test-item-1";

        const { container } = render(
            <PublicLayoutShell>
                <div>Preview content</div>
            </PublicLayoutShell>
        );

        const main = container.querySelector("main");

        expect(screen.getByTestId("mobile-header")).toHaveAttribute("data-compact", "false");
        expect(screen.queryByTestId("mobile-bottom-nav")).not.toBeInTheDocument();
        expect(screen.getByText("Preview content")).toBeInTheDocument();
        expect(main).toHaveClass("lg:pl-16");
        expect(main).not.toHaveClass("mobile-shell-bottom-padding");
        expect(main).not.toHaveClass("mobile-shell-bottom-padding-compact");
        expect(main?.firstElementChild).toHaveClass("mobile-header-height");
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
        expect(main).toHaveClass("h-full");
        expect(main).toHaveClass("overflow-hidden");
        expect(main).not.toHaveClass("mobile-shell-bottom-padding");
        expect(main).not.toHaveClass("mobile-shell-bottom-padding-compact");
        expect(container.firstElementChild).toHaveClass("h-[100dvh]");
    });

    it("uses standard mobile chrome and padding on default app routes", () => {
        pathnameState.value = "/requests";

        const { container } = render(
            <PublicLayoutShell>
                <div>Requests content</div>
            </PublicLayoutShell>
        );

        const main = container.querySelector("main");

        expect(screen.getByTestId("mobile-header")).toHaveAttribute("data-compact", "false");
        expect(screen.getByTestId("mobile-bottom-nav")).toHaveAttribute("data-compact", "false");
        expect(screen.getByText("Requests content")).toBeInTheDocument();
        expect(main).toHaveClass("lg:pl-16");
        expect(main).toHaveClass("mobile-shell-bottom-padding");
        expect(main).toHaveClass("lg:pb-0");
        expect(main?.firstElementChild).toHaveClass("mobile-header-height");
        expect(container.firstElementChild).toHaveClass("min-h-dvh");
    });
});
