import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import SettingsPage from "@/app/(public)/settings/page";
import { vi } from "vitest";

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            getUser: vi.fn().mockResolvedValue({
                data: { user: null },
            }),
        },
    }),
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => ({
        refresh: vi.fn(),
    }),
}));

vi.mock("@/lib/actions/auth", () => ({
    signOutAction: vi.fn(),
}));

describe("SettingsPage", () => {
    it("includes a replay app tour link", async () => {
        render(<SettingsPage />);

        expect(await screen.findByText("Not signed in.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /replay app tour/i })).toHaveAttribute(
            "href",
            "/browse?tour=app-v1"
        );
    });
});
