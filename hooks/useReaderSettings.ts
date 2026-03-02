import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

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

type ReaderSettingsPayload = Pick<
    ReaderSettingsState,
    "fontSize" | "fontFamily" | "readerTheme" | "lineHeight"
>;

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

function isReaderSettingsPayload(value: unknown): value is Partial<ReaderSettingsPayload> {
    if (!value || typeof value !== "object") return false;

    const candidate = value as Record<string, unknown>;
    const validFontSize = ["small", "medium", "large"];
    const validFontFamily = ["sans", "serif"];
    const validReaderTheme = ["dark", "light", "sepia"];
    const validLineHeight = ["compact", "default", "relaxed"];

    if (candidate.fontSize !== undefined && !validFontSize.includes(String(candidate.fontSize))) return false;
    if (candidate.fontFamily !== undefined && !validFontFamily.includes(String(candidate.fontFamily))) return false;
    if (candidate.readerTheme !== undefined && !validReaderTheme.includes(String(candidate.readerTheme))) return false;
    if (candidate.lineHeight !== undefined && !validLineHeight.includes(String(candidate.lineHeight))) return false;

    return true;
}

// Helper to push settings to cloud
const pushToCloud = async (settings: Partial<ReaderSettingsState>) => {
    try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const payload: Partial<ReaderSettingsPayload> = {
            fontSize: settings.fontSize,
            fontFamily: settings.fontFamily,
            readerTheme: settings.readerTheme,
            lineHeight: settings.lineHeight,
        };

        await supabase
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

                    const profile = (data ?? null) as Pick<ProfileRow, "reader_settings"> | null;

                    if (!error && isReaderSettingsPayload(profile?.reader_settings)) {
                        const settings = profile.reader_settings;
                        if (settings && Object.keys(settings).length > 0) {
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
