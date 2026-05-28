import { describe, expect, it } from "vitest";
import {
    buildNotesContextSelection,
    rankHighlightsByRelevance,
    type HighlightContextRow,
} from "@/lib/server/notes-chat-context";

function createHighlight(overrides: Partial<HighlightContextRow> = {}): HighlightContextRow {
    return {
        id: overrides.id ?? crypto.randomUUID(),
        highlighted_text: overrides.highlighted_text ?? "A short highlighted passage.",
        note_body: overrides.note_body ?? null,
        created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
        content_item: overrides.content_item ?? { title: "Untitled" },
        segment: overrides.segment ?? { title: "Section" },
    };
}

describe("Ask These Notes context selection", () => {
    it("ranks scoped notes by query similarity instead of original order", () => {
        const newestIrrelevant = createHighlight({
            id: "00000000-0000-0000-0000-000000000001",
            highlighted_text: "A taxonomy of unrelated admin tasks.",
            created_at: "2026-01-02T00:00:00.000Z",
            content_item: { title: "Admin Notes" },
        });
        const olderRelevant = createHighlight({
            id: "00000000-0000-0000-0000-000000000002",
            highlighted_text: "Discipline compounds when attention is protected.",
            note_body: "Discipline and focus are the main themes here.",
            created_at: "2026-01-01T00:00:00.000Z",
            content_item: { title: "Deep Work" },
        });

        const ranked = rankHighlightsByRelevance(
            [newestIrrelevant, olderRelevant],
            [1, 0],
            [
                [0, 1],
                [1, 0],
            ]
        );

        expect(ranked?.[0]).toBe(olderRelevant);
        expect(ranked?.[1]).toBe(newestIrrelevant);
    });

    it("keeps context within the character budget and reports omitted notes", () => {
        const relevant = createHighlight({
            content_item: { title: "Relevant Source" },
            note_body: "discipline ".repeat(50),
            highlighted_text: "This highlight should be trimmed after the note body.",
        });
        const omitted = createHighlight({
            content_item: { title: "Omitted Source" },
            highlighted_text: "This note should not fit into the tiny context budget.",
        });

        const selection = buildNotesContextSelection([relevant, omitted], {
            maxContextChars: 180,
            selectionMode: "relevance_ranked",
        });

        expect(selection.contextText.length).toBeLessThanOrEqual(180);
        expect(selection.contextText).toContain("Relevant Source");
        expect(selection.contextText).not.toContain("Omitted Source");
        expect(selection.includedCount).toBe(1);
        expect(selection.omittedCount).toBe(1);
        expect(selection.selectionMode).toBe("relevance_ranked");
    });

    it("returns null ranking for invalid embeddings so callers can preserve scope order", () => {
        const first = createHighlight({ content_item: { title: "First Source" } });
        const second = createHighlight({ content_item: { title: "Second Source" } });

        const ranked = rankHighlightsByRelevance([first, second], [1, 0], [[1, 0]]);
        const fallbackSelection = buildNotesContextSelection(ranked ?? [first, second], {
            selectionMode: ranked ? "relevance_ranked" : "scope_order",
        });

        expect(ranked).toBeNull();
        expect(fallbackSelection.contextText.indexOf("First Source")).toBeLessThan(
            fallbackSelection.contextText.indexOf("Second Source")
        );
        expect(fallbackSelection.selectionMode).toBe("scope_order");
    });
});
