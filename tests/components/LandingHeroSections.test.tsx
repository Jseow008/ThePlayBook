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
  it("expands the compact header controls without changing their visible sizing classes", () => {
    render(<LandingHeader />);

    expect(screen.getByRole("link", { name: "Netflux" })).toHaveClass("touch-target-44");
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveClass("touch-target-44");
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveClass("px-3", "py-1.5");
  });

  it("shows the landing proposition and keeps the CTA hierarchy", () => {
    render(<HeroSection />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Know what’s worth your time. Keep what’s worth remembering.",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Explore structured breakdowns of books, podcasts, articles, and videos. Decide where to go deeper, capture key insights, and retrieve them when life makes them relevant."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/summaries$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/topics$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore a Summary" })).toHaveAttribute(
      "href",
      "/browse"
    );
    expect(screen.getByRole("link", { name: "Build Your Library Free" })).toHaveAttribute(
      "href",
      "/login"
    );
  });
});
