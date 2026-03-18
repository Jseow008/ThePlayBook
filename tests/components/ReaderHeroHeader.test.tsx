import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReaderHeroHeader } from "@/components/reader/ReaderHeroHeader";

vi.mock("@/components/reader/AudioPlayer", () => ({
    AudioPlayer: () => <div data-testid="mock-audio-player" />,
}));

vi.mock("@/components/ui/ShareButton", () => ({
    ShareButton: () => <button type="button">Share</button>,
}));

vi.mock("@/components/reader/ReaderSettingsMenu", () => ({
    ReaderSettingsMenu: () => <button type="button">Settings</button>,
}));

vi.mock("@/hooks/useReadingTimer", () => ({
    useReadingTimer: () => ({ formattedTime: "0:59" }),
}));

vi.mock("@/components/ui/ResilientImage", () => ({
    ResilientImage: () => <div data-testid="mock-cover-image" />,
}));

describe("ReaderHeroHeader", () => {
    it("clamps displayed progress to 100 percent", () => {
        render(
            <ReaderHeroHeader
                title="Deep Work"
                author="Cal Newport"
                type="book"
                coverImageUrl={null}
                audioUrl={null}
                durationSeconds={240}
                segmentsTotal={5}
                segmentsRead={7}
            />
        );

        expect(screen.getByText("Reading Progress")).toBeInTheDocument();
        expect(screen.getByText("100%")).toBeInTheDocument();
    });
});
