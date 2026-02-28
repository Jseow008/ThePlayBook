import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createClient } from "@/lib/supabase/client";

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
    syncFromCloud: () => Promise<void>;
}

// Helper to push settings to cloud
const pushToCloud = async (settings: Partial<ReaderSettingsState>) => {
    try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { fontSize, fontFamily, readerTheme, lineHeight } = settings;
        const payload = { fontSize, fontFamily, readerTheme, lineHeight };

        await (supabase as any)
            .from("profiles")
            .update({ reader_settings: payload })
            .eq("id", session.user.id);
    } catch (err) {
        console.error("Failed to push reader settings to cloud:", err);
    }
};

export const useReaderSettings = create<ReaderSettingsState>()(
    persist(
        (set, get) => ({
            fontSize: "medium",
            fontFamily: "serif",
            readerTheme: "dark",
            lineHeight: "default",
            setFontSize: (size) => {
                set({ fontSize: size });
                pushToCloud(get());
            },
            setFontFamily: (family) => {
                set({ fontFamily: family });
                pushToCloud(get());
            },
            setReaderTheme: (theme) => {
                set({ readerTheme: theme });
                pushToCloud(get());
            },
            setLineHeight: (height) => {
                set({ lineHeight: height });
                pushToCloud(get());
            },
            syncFromCloud: async () => {
                try {
                    const supabase = createClient();
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session?.user) return;

                    const { data, error } = await supabase
                        .from("profiles")
                        .select("reader_settings")
                        .eq("id", session.user.id)
                        .single();

                    if (!error && (data as any)?.reader_settings) {
                        const settings = (data as any).reader_settings as any;
                        if (Object.keys(settings).length > 0) {
                            set({
                                fontSize: settings.fontSize || get().fontSize,
                                fontFamily: settings.fontFamily || get().fontFamily,
                                readerTheme: settings.readerTheme || get().readerTheme,
                                lineHeight: settings.lineHeight || get().lineHeight,
                            });
                        }
                    }
                } catch (err) {
                    console.error("Failed to sync reader settings from cloud:", err);
                }
            }
        }),
        {
            name: "flux_reader_settings",
        }
    )
);
