import { describe, expect, it } from "vitest";
import { hasNotesComparisonActivity, notesComparisonActivity } from "@/lib/server/notes-comparison-outcome";
import { selectedPersonalEvidence } from "../helpers/selected-personal-evidence";
import type { PersonalEvidenceTextField } from "@/lib/server/personal-evidence-ranking";

function passage(text: string, field: PersonalEvidenceTextField = "noteBody") {
    const row = selectedPersonalEvidence();
    return { ...row, spans: [{ text, field, start: 0, end: text.length, score: .9 }] };
}

describe("Notes evidence must address an explicitly named outcome", () => {
    it("does not substitute generic time saved or titles/prompts for search speed", () => {
        const activity = notesComparisonActivity("Compare my notes on whether tagging made my searches faster.");
        expect(activity).toEqual(["search"]);
        expect(hasNotesComparisonActivity(passage("I saved time afterward by tagging early."), activity)).toBe(false);
        expect(hasNotesComparisonActivity(passage("Did it make searching faster?", "prompt"), activity)).toBe(false);
    });

    it("retains inflected references so Luna can judge the actual relationship", () => {
        const activity = notesComparisonActivity("Compare whether early themes made my searches easier.");
        expect(hasNotesComparisonActivity(passage("Searching took me half as long with the new themes."), activity)).toBe(true);
        expect(hasNotesComparisonActivity(passage("I searched the notes but nothing changed."), activity)).toBe(true);
    });

    it("requires a compound activity in the stored text and leaves normal comparisons alone", () => {
        const activity = notesComparisonActivity("Compare whether the checklists made my appointment changes quicker.");
        expect(activity).toEqual(["appointment", "change"]);
        expect(hasNotesComparisonActivity(passage("Appointments were easier to remember."), activity)).toBe(false);
        expect(hasNotesComparisonActivity(passage("I changed appointments with less effort."), activity)).toBe(true);
        expect(notesComparisonActivity("Compare the benefits and drawbacks of the two methods.")).toEqual([]);
        expect(notesComparisonActivity("For that same topic, compare whether that made it easier.")).toEqual([]);
    });
});
