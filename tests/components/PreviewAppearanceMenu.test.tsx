import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewAppearanceMenu } from "@/components/ui/PreviewAppearanceMenu";
import { ReaderSettingsMenu } from "@/components/reader/ReaderSettingsMenu";
import type { ReaderTheme } from "@/hooks/useReaderSettings";
const settings = vi.hoisted(() => ({
    setTheme: vi.fn<(theme: ReaderTheme) => void>(),
    getTheme: vi.fn<() => string>(),
}));

vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("@/hooks/useReaderSettings", async () => {
    const { create } = await import("zustand");
    const store = create<{ readerTheme: string; fontSize: string; fontFamily: string; lineHeight: string }>((set) => ({
        readerTheme: "sepia", fontSize: "medium", fontFamily: "serif", lineHeight: "default",
        setReaderTheme: (readerTheme: string) => set({ readerTheme }),
        setFontSize: (fontSize: string) => set({ fontSize }),
        setFontFamily: (fontFamily: string) => set({ fontFamily }),
        setLineHeight: (lineHeight: string) => set({ lineHeight }),
    }));
    settings.setTheme.mockImplementation((readerTheme) => store.setState({ readerTheme, fontSize: "medium", fontFamily: "serif", lineHeight: "default" }));
    settings.getTheme.mockImplementation(() => store.getState().readerTheme);
    return { useReaderSettings: store };
});

describe("Preview Appearance", () => {
    beforeEach(() => {
        settings.setTheme("sepia");
    });

    it("exposes the shared Aa controls, with the shared-setting description", async () => {
        render(<PreviewAppearanceMenu />);
        fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
        const dialog = await screen.findByRole("dialog", { name: "Appearance" });
        expect(dialog).toHaveAccessibleDescription("Applies to Preview and the reader.");
        const theme = within(dialog).getByRole("group", { name: "Theme" });
        expect(within(theme).getAllByRole("button")).toHaveLength(3);
        expect(within(theme).getByRole("button", { name: "Sepia" })).toHaveAttribute("aria-pressed", "true");
        for (const name of ["Font", "Size", "Spacing"]) expect(within(dialog).getByRole("group", { name })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Appearance" })).toHaveTextContent("Aa");
        expect(within(dialog).queryByRole("button", { name: /fullscreen/i })).not.toBeInTheDocument();
    });

    it("uses the same theme state as Read in both directions", async () => {
        render(<><PreviewAppearanceMenu /><ReaderSettingsMenu /></>);
        fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
        fireEvent.click(screen.getByRole("button", { name: "Dark" }));
        expect(settings.getTheme()).toBe("dark");
        fireEvent.click(screen.getByRole("button", { name: "Close Appearance" }));
        fireEvent.click(screen.getByRole("button", { name: "Display Settings" }));
        expect(await screen.findByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(screen.getByRole("button", { name: "Light" }));
        fireEvent.keyDown(document, { key: "Escape" });
        fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
        expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    });

    it.each(["Escape", "outside", "close"])("dismisses by %s and restores focus without changing the theme", async (method) => {
        render(<PreviewAppearanceMenu />);
        const trigger = screen.getByRole("button", { name: "Appearance" });
        fireEvent.click(trigger);
        await waitFor(() => expect(screen.getByRole("button", { name: "Close Appearance" })).toHaveFocus());
        if (method === "Escape") fireEvent.keyDown(document, { key: "Escape" });
        else if (method === "outside") fireEvent.mouseDown(document.body);
        else fireEvent.click(screen.getByRole("button", { name: "Close Appearance" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(settings.getTheme()).toBe("sepia");
    });

    it("reflects a theme reset while open without writing the previous selection back", () => {
        render(<PreviewAppearanceMenu />);
        fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
        act(() => settings.setTheme("light"));
        expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
        fireEvent.keyDown(document, { key: "Escape" });
        expect(settings.getTheme()).toBe("light");
    });

    it("shares font, size boundaries and spacing with the reader", async () => {
        render(<><PreviewAppearanceMenu /><ReaderSettingsMenu /></>);
        fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
        await screen.findByRole("dialog", { name: "Appearance" });
        fireEvent.click(screen.getByRole("button", { name: "Sans" }));
        fireEvent.click(screen.getByRole("button", { name: "Decrease font size" }));
        expect(screen.getByRole("button", { name: "Decrease font size" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Increase font size" }));
        fireEvent.click(screen.getByRole("button", { name: "Increase font size" }));
        expect(screen.getByRole("button", { name: "Increase font size" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Relaxed line spacing" }));
        fireEvent.click(screen.getByRole("button", { name: "Close Appearance" }));
        fireEvent.click(screen.getByRole("button", { name: "Display Settings" }));
        await screen.findByRole("dialog", { name: "Reader Settings" });
        expect(screen.getByRole("button", { name: "Sans" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Relaxed line spacing" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("group", { name: "Size" })).toHaveTextContent("large");
        expect(screen.getByRole("button", { name: "Fullscreen" })).toBeInTheDocument();
    });
});
