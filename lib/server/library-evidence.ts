import "server-only";
import { PERSONAL_RETRIEVAL_RULES, GROUNDED_ANSWER_FOCUS, exactPersonalQuoteField, personalSelectionCandidates, materializePersonalSelection, type retrievePersonalEvidence } from "@/lib/server/personal-retrieval";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { rankSourceEvidenceSpans, formatRankedPersonalEvidence, type rankPersonalEvidence } from "@/lib/server/personal-evidence-ranking";

import { selectPersonalEvidence, type PersonalEvidenceSelectionGenerator } from "@/lib/server/personal-evidence-selector";

export type LibrarySourceEvidence = {
    type: "source_segment";
    evidenceId: string;
    id: string;
    contentItemId: string;
    title: string;
    text: string;
    fingerprint: string;
    score: number;
    span?: { text: string; start: number; end: number };
};

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadLibrarySourceEvidence(options: {
    supabase: Client;
    userId: string;
    queryEmbedding: number[];
    boostCompleted?: boolean;
    signal: AbortSignal;
}): Promise<LibrarySourceEvidence[]> {
    const { userId, queryEmbedding, signal } = options;
    // SSR 0.5 uses the earlier SupabaseClient generic ordering. Narrow the
    // adapter to the two unchanged query methods, preserving generated RPC types.
    const supabase = options.supabase as unknown as Pick<SupabaseClient<Database>, "from" | "rpc">;
    const { data: matches, error } = await supabase.rpc("match_library_segments_gemini", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.55,
        match_count: 32,
        p_user_id: userId,
        p_boost_completed: options.boostCompleted ?? false,
    }).abortSignal(signal);
    if (error) throw new Error("Source retrieval failed", { cause: error });
    if (!matches?.length) return [];
    const { data: rows, error: rowError } = await supabase.from("segment")
        .select("id, item_id, markdown_body, content_item (id, title, status, deleted_at)")
        .in("id", matches.map((match) => match.segment_id)).is("deleted_at", null).abortSignal(signal);
    if (rowError) throw new Error("Source retrieval failed", { cause: rowError });
    signal.throwIfAborted();
    return matches.flatMap((match) => {
        const row = rows?.find((item) => item.id === match.segment_id);
        const source = Array.isArray(row?.content_item) ? row.content_item[0] : row?.content_item;
        if (!row || !source || source.status !== "verified" || source.deleted_at !== null || row.item_id !== match.content_item_id || source.id !== match.content_item_id) return [];
        return [{
            type: "source_segment" as const,
            evidenceId: `source_segment:${row.id}`,
            id: row.id,
            contentItemId: row.item_id,
            title: source.title,
            text: row.markdown_body,
            fingerprint: createHash("sha256").update(JSON.stringify([row.id, row.item_id, source.title, row.markdown_body])).digest("hex"),
            score: match.similarity,
        }];
    });
}

/** Rank within each already-authorized editorial passage; never take an arbitrary prefix. */
export async function rankLibrarySourceSpans(options: {
    sources: LibrarySourceEvidence[];
    userId: string;
    queryEmbedding: number[];
    signal: AbortSignal;
}) {
    const { spans } = await rankSourceEvidenceSpans({
        sources: options.sources,
        ownerId: options.userId,
        queryEmbedding: options.queryEmbedding,
        apiKey: process.env.GEMINI_API_KEY,
        signal: options.signal,
    });
    return options.sources.flatMap((source) => {
        const span = spans.find((item) => item.id === source.id);
        return span ? [{ ...source, span: { text: span.text, start: span.start, end: span.end } }] : [];
    });
}

export function composeLibraryEvidence(
    personal: Awaited<ReturnType<typeof rankPersonalEvidence>>,
    sources: LibrarySourceEvidence[],
    selectionOrder?: readonly string[],
) {
    const ranked = [
        ...personal.items.map((item) => ({
            evidenceId: item.evidence.evidenceId,
            score: item.score,
            text: `[Personal ${item.evidence.type}: ${item.evidence.evidenceId}; source: ${item.evidence.source?.title ?? "unavailable"}; source status: ${item.evidence.sourceStatus}]\n`
                + item.spans.map((span) => `${span.field} (stored characters ${span.start}–${span.end}): ${span.text}`).join("\n"),
        })),
        ...sources.filter((item) => item.span).map((item) => ({
            evidenceId: item.evidenceId,
            score: item.score,
            text: `[Editorial source: ${item.title}; ${item.evidenceId}; revision: ${item.fingerprint}; stored characters ${item.span!.start}–${item.span!.end}]\n${item.span!.text}`,
        })),
    ].sort((left, right) => selectionOrder
        ? selectionOrder.indexOf(left.evidenceId) - selectionOrder.indexOf(right.evidenceId)
        : right.score - left.score || left.evidenceId.localeCompare(right.evidenceId));
    // Conservative byte ceiling; benchmark records actual provider token counts.
    // Include whole evidence blocks so a personal disagreement is never clipped away.
    let contextText = "";
    const evidenceIds: string[] = [];
    for (const item of ranked) {
        if (evidenceIds.length === 8) break;
        const next = contextText ? `${contextText}\n\n${item.text}` : item.text;
        if (Buffer.byteLength(next, "utf8") > 4_000) continue;
        contextText = next;
        evidenceIds.push(item.evidenceId);
    }
    return { contextText, evidenceIds };
}

/** One semantic decision over all three authorized evidence classes. */
export async function selectLibraryEvidence(options: {
    personal: Awaited<ReturnType<typeof retrievePersonalEvidence>>;
    sources: LibrarySourceEvidence[];
    question: string;
    semanticQuestion?: string;
    signal: AbortSignal;
    selectionGenerator?: PersonalEvidenceSelectionGenerator;
}) {
    const sourceQuote = Boolean(exactPersonalQuoteField(options.question)) && !options.personal.quoteField;
    const candidates = [
        ...(sourceQuote ? [] : personalSelectionCandidates(options.personal.items)),
        ...(options.personal.quoteField ? [] : options.sources.filter((source) => source.span).map((source) => ({
            id: source.evidenceId, type: "source_segment" as const, title: source.title,
            fields: [{ name: "sourceText" as const, text: source.span!.text }],
        }))),
    ];
    const selection = await selectPersonalEvidence({ question: options.semanticQuestion ?? options.question, candidates,
        exactQuote: sourceQuote || Boolean(options.personal.quoteField), signal: options.signal, generate: options.selectionGenerator });
    const personalItems = materializePersonalSelection(options.personal.items, selection.ids, options.personal.quoteField);
    const personal = { ...options.personal, ...formatRankedPersonalEvidence(personalItems), selection };
    const sources = selection.ids.flatMap((id) => options.sources.filter((source) => source.evidenceId === id));
    const exactQuote = sourceQuote ? sources[0]?.text ?? null : personal.items.find((item) => item.exactQuote !== null)?.exactQuote ?? null;
    const quoteTooLarge = exactQuote !== null && Buffer.byteLength(exactQuote, "utf8") > 4_000;
    return { personal, sources, selection, exactQuote: quoteTooLarge ? null : exactQuote, quoteTooLarge,
        ...composeLibraryEvidence(personal, sources, selection.ids) };
}

export function buildLibraryEvidencePrompt(metadataContext: string, retrievalContextForPrompt: string, intent: string) {
    return `You are Ask My Library.
Answer only from the evidence below.

Library metadata:
${metadataContext}

Retrieved passages:
${retrievalContextForPrompt}

Intent: ${intent}

Rules:
${PERSONAL_RETRIEVAL_RULES}
- Use metadata for inventory, counts, titles, authors, and reading status.
- Use retrieved passages for themes, comparisons, and content-based reasoning.
- For hybrid questions, combine both. If passages are limited, answer from metadata first and say passage evidence is limited.
- For reading_advisor questions, recommend only from eligible next-read candidates explicitly listed in Library metadata.
- UNDER NO CIRCUMSTANCES recommend a book, article, author, or source that is not explicitly listed in the provided library metadata.
- If there are no good internal-library matches, say so and ask the user whether they want broader discovery outside their library.
- If passage evidence is thin for a reading_advisor question, still make a qualified recommendation from metadata, statuses, authors, and categories instead of repeatedly apologizing.
- Never invent sources, authors, progress, or themes.
- If metadata is empty, say so plainly.
- Keep answers short and structured. Use bullets for lists. Do not write a long essay unless asked.\n\n${GROUNDED_ANSWER_FOCUS}`;
}
