import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeroSection } from "@/components/ui/landing/LandingHeroSections";

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

describe("Landing hero", () => {
  it("shows the landing proposition and keeps the CTA hierarchy", () => {
    render(<HeroSection />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Discover the ideas you didn’t know you needed.",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Turn books, podcasts, articles, and videos into knowledge that compounds."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/summaries$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/topics$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore the Library" })).toHaveAttribute(
      "href",
      "/browse"
    );
    expect(screen.getByRole("link", { name: "Sign Up Free" })).toHaveAttribute(
      "href",
      "/login"
    );
  });
});
