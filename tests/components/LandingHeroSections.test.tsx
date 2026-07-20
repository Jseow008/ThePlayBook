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
  it("shows concrete library proof and keeps the CTA hierarchy", () => {
    render(<HeroSection totalContentCount={487} totalTopicCount={23} />);

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
    expect(screen.getByText("400+ summaries")).toBeInTheDocument();
    expect(screen.getByText("20+ topics")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore the Library" })).toHaveAttribute(
      "href",
      "/browse"
    );
    expect(screen.getByRole("link", { name: "Sign Up Free" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("uses conservative proof copy for a small library", () => {
    render(<HeroSection totalContentCount={72} totalTopicCount={7} />);

    expect(screen.getByText("Curated summaries")).toBeInTheDocument();
    expect(screen.getByText("7 topics")).toBeInTheDocument();
  });

  it("uses neutral topic proof when category data is unavailable", () => {
    render(<HeroSection totalContentCount={487} totalTopicCount={0} />);

    expect(screen.getByText("Topics across the library")).toBeInTheDocument();
  });
});
