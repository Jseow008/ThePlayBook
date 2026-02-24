import { create } from "zustand";
import { persist } from "zustand/middleware";

export type FontSize = "small" | "medium" | "large";
export type FontFamily = "sans" | "serif";
export type ReaderTheme = "dark" | "light" | "sepia";

interface ReaderSettingsState {
    fontSize: FontSize;
    fontFamily: FontFamily;
    readerTheme: ReaderTheme;
    setFontSize: (size: FontSize) => void;
    setFontFamily: (family: FontFamily) => void;
    setReaderTheme: (theme: ReaderTheme) => void;
}

export const useReaderSettings = create<ReaderSettingsState>()(
    persist(
        (set) => ({
            fontSize: "medium",
            fontFamily: "serif",
            readerTheme: "dark",
            setFontSize: (size) => set({ fontSize: size }),
            setFontFamily: (family) => set({ fontFamily: family }),
            setReaderTheme: (theme) => set({ readerTheme: theme }),
        }),
        {
            name: "flux_reader_settings",
        }
    )
);
