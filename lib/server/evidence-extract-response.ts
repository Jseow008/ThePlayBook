import "server-only";
import type { RankedPersonalEvidence } from "@/lib/server/personal-evidence-ranking";
import type { LibrarySourceEvidence } from "@/lib/server/library-evidence";

/** Escape stored data for the existing Markdown renderer: never create links, HTML or headings from captures. */
function literal(text: string): string {
    return text.replace(/[\r\n\t]+/g, " ").replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, "\\$&");
}

function quote(text: string): string {
    // A longer fence than any stored run cannot be closed by untrusted text.
    // Literal blocks also preserve indentation and punctuation without Markdown escapes.
    const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(Math.max(3, longest + 1));
    return `${fence}\n${text}\n${fence}`;
}

/** Input is the final authorized, freshness-checked selection, after existing composition limits. */
export function renderEvidenceExtracts(options: {
    personal: readonly RankedPersonalEvidence[];
    sources?: readonly LibrarySourceEvidence[];
    evidenceIds?: readonly string[];
}): string {
    const sources = options.sources ?? [];
    const ids = options.evidenceIds ?? options.personal.map((item) => item.evidence.evidenceId);
    if (ids.length > 8 || new Set(ids).size !== ids.length) throw new Error("Invalid extract selection");
    const blocks = ids.map((id) => {
        const personal = options.personal.find((item) => item.evidence.evidenceId === id);
        const source = sources.find((item) => item.evidenceId === id);
        if (Boolean(personal) === Boolean(source)) throw new Error("Ambiguous or missing extract identity");
        if (personal) {
            const record = personal.evidence;
            const fields = personal.spans.filter((span) => span.field !== "prompt").map((span) => {
                const full = record.type === "highlight"
                    ? span.field === "highlightedText" ? record.highlightedText : span.field === "noteBody" ? record.noteBody : null
                    : span.field === "reflectionText" ? record.reflectionText : null;
                if (full === null || span.start < 0 || span.end <= span.start || span.end > full.length
                    || full.slice(span.start, span.end) !== span.text) throw new Error("Invalid extract span");
                const label = span.field === "highlightedText" ? "You highlighted" : span.field === "noteBody" ? "Your note" : "Your reflection";
                const excerpt = span.start !== 0 || span.end !== full.length;
                return `**${label}${excerpt ? " (excerpt)" : ""}**\n\n${quote(span.text)}`;
            });
            if (!fields.length) throw new Error("Extract has no evidence text");
            const title = record.sourceStatus === "available" && record.source ? literal(record.source.title) : "Source unavailable";
            return `### ${title}\n\n${fields.join("\n\n")}`;
        }
        const span = source!.span;
        if (!span || span.start < 0 || span.end <= span.start || span.end > source!.text.length
            || source!.text.slice(span.start, span.end) !== span.text) throw new Error("Invalid source extract span");
        return `### ${literal(source!.title)}\n\n**Editorial passage${span.start !== 0 || span.end !== source!.text.length ? " (excerpt)" : ""}**\n\n${quote(span.text)}`;
    });
    if (!blocks.length) throw new Error("No evidence to render");
    return `Saved evidence matching your question. These are extracts, not a generated explanation.\n\n${blocks.join("\n\n---\n\n")}\n\nExcerpt labels indicate partial text. Open the saved record or source for full context. To change the results, refine your question or adjust the available filters.`;
}
