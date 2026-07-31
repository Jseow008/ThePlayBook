import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CorePlatformFeaturesSection,
  FinalCTASection,
} from "@/components/ui/landing/LandingPageSections";

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

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

describe("landing positioning sections", () => {
  it("presents the understand, keep, and use knowledge loop", () => {
    render(<CorePlatformFeaturesSection />);

    expect(screen.getByRole("heading", { name: "Find the essential ideas faster." }))
      .toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Show Understand storyboard" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show Keep storyboard" }));
    expect(
      screen.getByRole("heading", {
        name: "Keep what matters, with its context attached.",
      })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show Use storyboard" }));
    expect(
      screen.getByRole("heading", {
        name: "Ask your library—not the entire internet.",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Search your saved knowledge or ask questions grounded in the summaries, highlights, and notes you chose to keep."
      )
    ).toBeInTheDocument();
  });

  it("carries the knowledge-library positioning into the final CTA", () => {
    render(<FinalCTASection />);

    expect(screen.getByRole("heading", { name: "Stop forgetting what you learn." }))
      .toBeInTheDocument();
    expect(
      screen.getByText(
        "Start building a library of ideas you can understand, keep, and actually use."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Build Your Library Free" }))
      .toHaveAttribute("href", "/login");
  });
});
