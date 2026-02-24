import { create } from "zustand";
import { persist } from "zustand/middleware";

export type FontSize = "small" | "medium" | "large";
export type FontFamily = "sans" | "serif";
export type ReaderTheme = "dark" | "light" | "sepia";
export type LineHeight = "compact" | "default" | "relaxed";

interface ReaderSettingsState {
    fontSize: FontSize;
    fontFamily: FontFamily;
    readerTheme: ReaderTheme;
    lineHeight: LineHeight;
    setFontSize: (size: FontSize) => void;
    setFontFamily: (family: FontFamily) => void;
    setReaderTheme: (theme: ReaderTheme) => void;
    setLineHeight: (height: LineHeight) => void;
}

export const useReaderSettings = create<ReaderSettingsState>()(
    persist(
        (set) => ({
            fontSize: "medium",
            fontFamily: "serif",
            readerTheme: "dark",
            lineHeight: "default",
            setFontSize: (size) => set({ fontSize: size }),
            setFontFamily: (family) => set({ fontFamily: family }),
            setReaderTheme: (theme) => set({ readerTheme: theme }),
            setLineHeight: (height) => set({ lineHeight: height }),
        }),
        {
            name: "flux_reader_settings",
        }
    )
);
