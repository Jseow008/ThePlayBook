import { describe, expect, it } from "vitest";
import { getCardQuickMode, toContentCardData, toHeroCardData } from "@/lib/server/content-card-data";

describe("content card data", () => {
    it("retains card and hero text without full summaries or source metadata", () => {
        const original = {
            id: "content-1", title: "Title", audio_url: "/audio.mp3",
            quick_mode_json: { hook: "A hook", big_idea: "An idea", key_takeaways: ["Full summary"], source_url: "source" },
        };
        expect(toContentCardData(original)).toEqual({
            id: original.id, title: original.title, audio_url: original.audio_url,
            quick_mode_json: { hook: "A hook" },
        });
        expect(toHeroCardData(original).quick_mode_json).toEqual({ hook: "A hook", big_idea: "An idea" });
        expect(original.quick_mode_json.key_takeaways).toEqual(["Full summary"]);
    });

    it.each([null, undefined, "legacy text", ["legacy array"], 42])("handles malformed or absent legacy quick mode %j", (value) => {
        expect(getCardQuickMode(value)).toBeNull();
    });

    it("keeps only string display fields", () => {
        expect(getCardQuickMode({ hook: ["bad"], big_idea: "Fallback", key_takeaways: [] }, true)).toEqual({ big_idea: "Fallback" });
        expect(getCardQuickMode({ hook: "", big_idea: 42 })).toEqual({ hook: "" });
    });
});
