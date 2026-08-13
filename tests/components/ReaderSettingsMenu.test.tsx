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

    it("labels and dismisses the compact sheet with a visible close action", async () => {
        render(<ReaderSettingsMenu />);

        fireEvent.click(screen.getByRole("button", { name: /display settings/i }));

        expect(await screen.findByRole("heading", { name: "Reader settings" })).toBeInTheDocument();
        const closeButton = screen.getByRole("button", { name: "Close reader settings" });
        expect(closeButton).toHaveClass("size-11");

        fireEvent.click(closeButton);

        expect(screen.queryByRole("dialog", { name: /reader settings/i })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /display settings/i })).toHaveAttribute("aria-expanded", "false");
    });

    it("exposes grouped setting labels and the selected choices", async () => {
        render(<ReaderSettingsMenu />);

        fireEvent.click(screen.getByRole("button", { name: /display settings/i }));
        await screen.findByRole("dialog", { name: /reader settings/i });

        expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");

        expect(screen.getByRole("group", { name: "Font" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sans" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Serif" })).toHaveAttribute("aria-pressed", "false");

        expect(screen.getByRole("group", { name: "Size" })).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "Spacing" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Compact line spacing" })).toHaveAttribute("aria-pressed", "false");
        expect(screen.getByRole("button", { name: "Default line spacing" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Relaxed line spacing" })).toHaveAttribute("aria-pressed", "false");
    });

    it("provides mobile-sized touch targets without enlarging desktop controls", async () => {
        render(<ReaderSettingsMenu />);

        const trigger = screen.getByRole("button", { name: /display settings/i });
        expect(trigger).toHaveClass("h-11", "w-11", "sm:h-10", "sm:w-10");

        fireEvent.click(trigger);
        await screen.findByRole("dialog", { name: /reader settings/i });

        expect(screen.getByRole("button", { name: "Sans" })).toHaveClass("min-h-11", "sm:min-h-0");
        expect(screen.getByRole("button", { name: "Decrease font size" })).toHaveClass("min-h-11", "min-w-11");
        expect(screen.getByRole("button", { name: "Default line spacing" })).toHaveClass("min-h-11", "sm:min-h-0");
    });
});
