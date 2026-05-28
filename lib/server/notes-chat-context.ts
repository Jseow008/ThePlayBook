import { GoogleGenAI } from "@google/genai";

export const MAX_NOTES_CONTEXT_CHARS = 9_000;

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const WRITTEN_NOTE_RELEVANCE_BOOST = 0.03;

export type HighlightContextRow = {
    id: string;
    highlighted_text: string;
    note_body: string | null;
    created_at: string | null;
    content_item: { title: string | null } | Array<{ title: string | null }> | null;
    segment: { title: string | null } | Array<{ title: string | null }> | null;
};

type HighlightContextCandidate = {
    row: HighlightContextRow;
    originalIndex: number;
    candidateText: string;
};

type NotesContextSelection = {
    contextText: string;
    includedCount: number;
    omittedCount: number;
    selectionMode: "relevance_ranked" | "scope_order";
};

function getRelation<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value ?? null;
}

function trimHighlightText(text: string, noteText: string | null): string {
    const maxChars = noteText ? 160 : 220;
    return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}...` : text;
}

function getHighlightSourceParts(highlight: HighlightContextRow) {
    const contentItem = getRelation(highlight.content_item);
    const segment = getRelation(highlight.segment);

    return {
        title: contentItem?.title || "Unknown Source",
        section: segment?.title?.trim(),
        noteText: highlight.note_body?.trim() || null,
    };
}

function buildHighlightContextEntry(highlight: HighlightContextRow, index: number): string {
    const { title, section, noteText } = getHighlightSourceParts(highlight);

    return [
        `[Note ${index + 1}: "${title}"${section ? ` • ${section}` : ""}]`,
        noteText ? `Note: ${noteText}` : null,
        `Highlight: ${trimHighlightText(highlight.highlighted_text, noteText)}`,
    ]
        .filter(Boolean)
        .join("\n");
}

function buildHighlightCandidateText(highlight: HighlightContextRow): string {
    const { title, section, noteText } = getHighlightSourceParts(highlight);

    return [
        `Source: ${title}`,
        section ? `Section: ${section}` : null,
        noteText ? `Written note: ${noteText}` : null,
        noteText ? `Written note emphasis: ${noteText}` : null,
        `Highlight: ${highlight.highlighted_text}`,
    ]
        .filter(Boolean)
        .join("\n");
}

function buildHighlightCandidates(rows: HighlightContextRow[]): HighlightContextCandidate[] {
    return rows.map((row, originalIndex) => ({
        row,
        originalIndex,
        candidateText: buildHighlightCandidateText(row),
    }));
}

function cosineSimilarity(left: number[], right: number[]): number | null {
    if (left.length === 0 || left.length !== right.length) {
        return null;
    }

    let dotProduct = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;

    for (let index = 0; index < left.length; index += 1) {
        const leftValue = left[index];
        const rightValue = right[index];
        dotProduct += leftValue * rightValue;
        leftMagnitude += leftValue * leftValue;
        rightMagnitude += rightValue * rightValue;
    }

    if (leftMagnitude === 0 || rightMagnitude === 0) {
        return null;
    }

    return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function isEmbeddingVector(value: number[] | undefined): value is number[] {
    return Array.isArray(value) && value.length === EMBEDDING_DIMENSIONS;
}

export function rankHighlightsByRelevance(
    rows: HighlightContextRow[],
    queryEmbedding: number[],
    noteEmbeddings: number[][]
): HighlightContextRow[] | null {
    if (rows.length !== noteEmbeddings.length) {
        return null;
    }

    const candidates = buildHighlightCandidates(rows);
    const scoredCandidates = candidates.map((candidate, index) => {
        const similarity = cosineSimilarity(queryEmbedding, noteEmbeddings[index]);
        if (similarity === null) {
            return null;
        }

        const noteBoost = candidate.row.note_body?.trim() ? WRITTEN_NOTE_RELEVANCE_BOOST : 0;
        return {
            ...candidate,
            score: similarity + noteBoost,
        };
    });

    if (scoredCandidates.some((candidate) => candidate === null)) {
        return null;
    }

    return scoredCandidates
        .filter((candidate): candidate is HighlightContextCandidate & { score: number } => Boolean(candidate))
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            return left.originalIndex - right.originalIndex;
        })
        .map((candidate) => candidate.row);
}

export function buildNotesContextSelection(
    rows: HighlightContextRow[],
    options: {
        maxContextChars?: number;
        selectionMode?: NotesContextSelection["selectionMode"];
    } = {}
): NotesContextSelection {
    const maxContextChars = options.maxContextChars ?? MAX_NOTES_CONTEXT_CHARS;
    const selectionMode = options.selectionMode ?? "scope_order";
    let contextText = "";
    let includedCount = 0;

    for (const row of rows) {
        const entry = buildHighlightContextEntry(row, includedCount);
        const separator = contextText ? "\n\n---\n\n" : "";
        const remainingChars = maxContextChars - contextText.length - separator.length;

        if (remainingChars <= 0) {
            break;
        }

        if (entry.length <= remainingChars) {
            contextText += `${separator}${entry}`;
            includedCount += 1;
            continue;
        }

        contextText += `${separator}${entry.slice(0, remainingChars).trimEnd()}`;
        includedCount += 1;
        break;
    }

    if (!contextText) {
        contextText = "No relevant note context is available for this request.";
    }

    return {
        contextText,
        includedCount,
        omittedCount: Math.max(0, rows.length - includedCount),
        selectionMode,
    };
}

export async function getRelevanceRankedHighlights(
    query: string,
    rows: HighlightContextRow[],
    apiKey: string
): Promise<HighlightContextRow[] | null> {
    if (rows.length <= 1) {
        return rows;
    }

    const candidates = buildHighlightCandidates(rows);
    const ai = new GoogleGenAI({ apiKey });
    const embeddingResponse = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [query, ...candidates.map((candidate) => candidate.candidateText)],
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });

    const embeddings = embeddingResponse.embeddings?.map((embedding) => embedding.values);
    if (!embeddings || embeddings.length !== rows.length + 1) {
        return null;
    }

    const [queryEmbedding, ...noteEmbeddings] = embeddings;
    if (!isEmbeddingVector(queryEmbedding)) {
        return null;
    }

    if (!noteEmbeddings.every(isEmbeddingVector)) {
        return null;
    }

    return rankHighlightsByRelevance(rows, queryEmbedding, noteEmbeddings);
}
