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
    MobileHeader: () => <header data-testid="mobile-header" />,
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

        render(
            <PublicLayoutShell>
                <div>Focus content</div>
            </PublicLayoutShell>
        );

        expect(screen.getByTestId("sidebar")).toBeInTheDocument();
        expect(screen.getByTestId("user-nav")).toBeInTheDocument();
        expect(screen.queryByTestId("mobile-header")).not.toBeInTheDocument();
        expect(screen.getByTestId("mobile-bottom-nav")).toBeInTheDocument();
        expect(screen.getByText("Focus content")).toBeInTheDocument();
    });
});
