import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/components/ui/LandingPage";

vi.mock("next/font/google", () => ({
  Instrument_Serif: () => ({ variable: "landing-hero-font" }),
}));

vi.mock("@/components/ui/landing/LandingDeferredSections", () => ({
  LandingDeferredSections: function DeferredSections() {
    return <div data-testid="landing-deferred-sections" />;
  },
}));

vi.mock("@/components/ui/landing/LandingHeroSections", () => ({
  LandingHeader: () => <header data-testid="landing-header" />,
  HeroSection: () => <section data-testid="landing-hero" />,
}));

vi.mock("@/components/ui/landing/landingCategories", () => ({
  getCuratedCategories: () => [],
}));

describe("LandingPage shell", () => {
  it("renders the ambient background deterministically with the landing route", () => {
    const { container } = render(
      <LandingPage featuredItems={[]} categories={[]} totalContentCount={0} />
    );

    const ambientBackground = container.querySelector("[data-netflux-ambient-background]");

    expect(ambientBackground).toBeInTheDocument();
    expect(ambientBackground?.children).toHaveLength(3);
    expect(screen.getByTestId("landing-header")).toBeInTheDocument();
    expect(screen.getByTestId("landing-hero")).toBeInTheDocument();
    expect(screen.getByTestId("landing-deferred-sections")).toBeInTheDocument();
  });
});
