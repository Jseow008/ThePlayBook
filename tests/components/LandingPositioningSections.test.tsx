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
  it("presents the explore, capture, and retrieve knowledge loop", () => {
    render(<CorePlatformFeaturesSection />);

    expect(screen.getByRole("heading", { name: "See the argument before you invest the hours." }))
      .toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Show Explore storyboard" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show Capture storyboard" }));
    expect(
      screen.getByRole("heading", {
        name: "Keep the insights and context that matter to you.",
      })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show Retrieve storyboard" }));
    expect(
      screen.getByRole("heading", {
        name: "Find the exact idea when it becomes useful again.",
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
