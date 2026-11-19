import { describe, expect, it } from "vitest";
import { formatRankedPersonalEvidence } from "@/lib/server/personal-evidence-ranking";
import { focusNotesComparison } from "@/lib/server/notes-comparison-context";
import { renderEvidenceExtractsWithRanges } from "@/lib/server/evidence-extract-response";
import { selectedPersonalEvidence } from "../helpers/selected-personal-evidence";

const question = "Compare how setting out cards and adding labels affected setup.";
function passage(text: string) {
    const row = selectedPersonalEvidence();
    if (row.evidence.type !== "highlight") throw new Error("Expected test note");
    return formatRankedPersonalEvidence([{
        ...row, evidence: { ...row.evidence, noteBody: text },
        spans: [{ text, field: "noteBody", start: 0, end: text.length, score: .9 }],
    }]);
}

describe("Notes comparison context", () => {
    it("keeps an incidental detail in the original excerpt but out of the synthesis context", () => {
        const evidence = passage("I put colored labels on the supply bins. The setup was faster afterward, but I took two markers home by mistake.");
        const before = renderEvidenceExtractsWithRanges({ personal: evidence.items });
        const context = focusNotesComparison(question, evidence);
        expect(context).toContain("I put colored labels on the supply bins. The setup was faster afterward");
        expect(context).not.toContain("markers");
        expect(renderEvidenceExtractsWithRanges({ personal: evidence.items })).toEqual(before);
        expect(before.text).toContain("two markers home by mistake");
    });

    it.each([
        "The setup was faster, but I accidentally doubled the setup cost.",
        "The setup was faster, but I had to repeat the first steps by mistake.",
        "The setup was faster, but I accidentally used one box because the other was locked.",
        "The setup was faster, but I needed another volunteer.",
        "The setup was faster, but I skipped the safety check by mistake.",
    ])("keeps outcome details, qualifications and causal links: %s", text => {
        const evidence = passage(text);
        expect(focusNotesComparison(question, evidence)).toBe(evidence.contextText);
    });

    it("preserves the detail if the user asks about it or asks a multi-outcome question", () => {
        const evidence = passage("The setup was faster, but I took two markers home by mistake.");
        for (const q of ["Compare what happened to the markers.", "Compare how the labels affected setup and cleanup."]) {
            expect(focusNotesComparison(q, evidence)).toBe(evidence.contextText);
        }
    });
});
