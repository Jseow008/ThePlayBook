import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderSettingsMenu } from "@/components/reader/ReaderSettingsMenu";

const mockUseMediaQuery = vi.fn<(query: string) => boolean>(() => true);
const mockSetFontSize = vi.fn();
const mockSetFontFamily = vi.fn();
const mockSetReaderTheme = vi.fn();
const mockSetLineHeight = vi.fn();

vi.mock("@/hooks/useMediaQuery", () => ({
    useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

vi.mock("@/hooks/useReaderSettings", () => ({
    useReaderSettings: () => ({
        fontSize: "medium",
        fontFamily: "sans",
        readerTheme: "dark",
        lineHeight: "default",
        setFontSize: mockSetFontSize,
        setFontFamily: mockSetFontFamily,
        setReaderTheme: mockSetReaderTheme,
        setLineHeight: mockSetLineHeight,
    }),
}));

describe("ReaderSettingsMenu", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseMediaQuery.mockReturnValue(true);
        document.body.style.overflow = "";
    });

    it("marks the compact sheet motion for reduced-motion browser handling", async () => {
        // Structural smoke test only: JSDOM does not evaluate prefers-reduced-motion.
        // Browser behavior is covered by the reduced-motion Playwright spec.
        render(<ReaderSettingsMenu />);

        fireEvent.click(screen.getByRole("button", { name: /display settings/i }));

        const sheet = await screen.findByRole("dialog", { name: /reader settings/i });
        expect(sheet).toHaveClass("reader-settings-motion-sheet");
        expect(sheet).toHaveClass("motion-reduce:animate-none");
        expect(sheet).toHaveClass("motion-reduce:transition-none");
    });
});
