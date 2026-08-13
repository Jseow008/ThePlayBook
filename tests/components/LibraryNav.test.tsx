import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibraryNav } from "@/components/ui/LibraryNav";

vi.mock("next/navigation", () => ({
    usePathname: () => "/library/reading",
}));

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: React.ReactNode;
        href: string;
    } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

describe("LibraryNav", () => {
    it("expands every mobile tab to the shared touch target", () => {
        render(<LibraryNav />);

        for (const label of ["Saved", "Continue Reading", "Completed"]) {
            expect(screen.getByRole("link", { name: label })).toHaveClass("touch-target-44");
        }

        expect(screen.getByRole("link", { name: "Continue Reading" })).toHaveAttribute(
            "aria-current",
            "page"
        );
    });
});
