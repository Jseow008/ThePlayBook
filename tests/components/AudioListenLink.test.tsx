import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AudioListenLink } from "@/components/ui/AudioListenLink";

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

describe("AudioListenLink", () => {
    const item = { id: "item-id", title: "Deep Work", audio_url: "https://example.com/audio.mp3" };

    it("opens the reader's audio player for an item with audio", () => {
        render(<AudioListenLink item={item} />);

        expect(screen.getByRole("link", { name: "Listen to Deep Work" })).toHaveAttribute(
            "href",
            "/read/item-id/deep-work#audio-player",
        );
    });

    it("does not offer listening when audio is unavailable", () => {
        render(<AudioListenLink item={{ ...item, audio_url: " " }} />);

        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
});
