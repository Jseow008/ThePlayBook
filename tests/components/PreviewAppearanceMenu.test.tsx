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
    const store = create<{ readerTheme: string }>((set) => ({
        readerTheme: "sepia", fontSize: "medium", fontFamily: "serif", lineHeight: "default",
        setReaderTheme: (readerTheme: string) => set({ readerTheme }),
        setFontSize: vi.fn(), setFontFamily: vi.fn(), setLineHeight: vi.fn(),
    }));
    settings.setTheme.mockImplementation((readerTheme) => store.setState({ readerTheme }));
    settings.getTheme.mockImplementation(() => store.getState().readerTheme);
    return { useReaderSettings: store };
});

describe("Preview Appearance", () => {
    beforeEach(() => {
        settings.setTheme("sepia");
    });

    it("exposes only Theme, with the shared-setting description", () => {
        render(<PreviewAppearanceMenu />);
        fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
        const dialog = screen.getByRole("dialog", { name: "Appearance" });
        expect(dialog).toHaveAccessibleDescription("Applies to Preview and the reader.");
        const theme = within(dialog).getByRole("group", { name: "Theme" });
        expect(within(theme).getAllByRole("button")).toHaveLength(3);
        expect(within(theme).getByRole("button", { name: "Sepia" })).toHaveAttribute("aria-pressed", "true");
        expect(within(dialog).queryByRole("group", { name: /font|size|spacing/i })).not.toBeInTheDocument();
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
        else if (method === "outside") fireEvent.pointerDown(document.body);
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
});
