import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeroSection, LandingHeader } from "@/components/ui/landing/LandingHeroSections";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/Logo", () => ({
  Logo: () => <span>Netflux</span>,
}));

describe("Landing hero", () => {
  it("gives the mobile sign-in action a visible 44px target", () => {
    render(<LandingHeader />);

    expect(screen.getByRole("link", { name: "Netflux" })).toHaveClass("touch-target-44");
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveClass("touch-target-44");
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveClass("min-h-11", "text-sm");
  });

  it("shows only the two-line landing proposition", () => {
    render(<HeroSection />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Know what’s worth your time. Keep what’s worth remembering.",
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Explore structured breakdowns/)).not.toBeInTheDocument();
  });
});
