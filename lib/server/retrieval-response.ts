import "server-only";

import { notesReplayOwner } from "./notes-replay-context";
import type { CitationLink } from "@/lib/evidence-citation";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

/** Stored quotations and empty retrievals do not need model reconstruction. */
export function retrievalTextResponse(text: string, protocol: "text" | "ui", citations: readonly CitationLink[] = [], exactQuotation = false) {
    const attemptId = notesReplayOwner()?.attemptId;
    if (protocol === "text") {
        return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return createUIMessageStreamResponse({
        headers: { "Cache-Control": "no-store" },
        stream: createUIMessageStream({
            execute({ writer }) {
                writer.write({ type: "text-start", id: "retrieval" });
                writer.write({ type: "text-delta", id: "retrieval", delta: text });
                writer.write({ type: "text-end", id: "retrieval" });
                if (exactQuotation) writer.write({ type: "data-exact-quotation", data: true });
                if (citations.length) writer.write({ type: "data-citations", data: citations });
                if (attemptId) writer.write({ type: "data-notes-attempt", data: attemptId });
                writer.write({ type: "finish", finishReason: "stop" });
            },
        }),
    });
}
