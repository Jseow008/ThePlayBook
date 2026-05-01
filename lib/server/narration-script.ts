import type { NarrationCostEstimate } from "@/lib/narration-cost";

export const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
export const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";

const MAX_CHARS_PER_CHUNK = 3_500;
const DEFAULT_NARRATION_SPEED = 1;
const ESTIMATED_NARRATION_WORDS_PER_MINUTE = 150;
const ESTIMATED_GPT_4O_MINI_TTS_COST_PER_MINUTE_USD = 0.015;

export interface NarrationSegmentSource {
    id?: string;
    order_index?: number;
    title: string | null;
    markdown_body: string;
}

export interface NarrationContentSource {
    title: string;
    author: string | null;
    quick_mode_json?: {
        hook?: string | null;
        big_idea?: string | null;
        key_takeaways?: string[] | null;
    } | null;
    segments: NarrationSegmentSource[];
}

export interface GeneratedNarrationSegmentTiming {
    id: string | null;
    order_index: number;
    start_time_sec: number | null;
    end_time_sec: number | null;
}

export class NarrationError extends Error {
    readonly code: string;
    readonly userMessage: string;
    readonly status: number;

    constructor(params: {
        code: string;
        userMessage: string;
        message?: string;
        status?: number;
        cause?: unknown;
    }) {
        super(params.message || params.userMessage);
        this.name = "NarrationError";
        this.code = params.code;
        this.userMessage = params.userMessage;
        this.status = params.status ?? 500;
        this.cause = params.cause;
    }
}

export function isNarrationError(error: unknown): error is NarrationError {
    return error instanceof NarrationError;
}

export function normalizeWhitespace(value: string) {
    return value
        .replace(/\r/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function stripMarkdown(markdown: string) {
    return normalizeWhitespace(
        markdown
            .replace(/```[\s\S]*?```/g, " ")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/^>\s?/gm, "")
            .replace(/^#{1,6}\s+/gm, "")
            .replace(/^[-*+]\s+/gm, "")
            .replace(/^\d+\.\s+/gm, "")
            .replace(/\|/g, " ")
            .replace(/[*_~]/g, "")
            .replace(/<[^>]+>/g, " ")
    );
}

function splitLongParagraph(paragraph: string, maxChars: number) {
    if (paragraph.length <= maxChars) {
        return [paragraph];
    }

    const sentenceMatches = paragraph.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
    const sentences = sentenceMatches.length > 0 ? sentenceMatches : [paragraph];
    const chunks: string[] = [];
    let currentChunk = "";

    const pushChunk = () => {
        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }
    };

    for (const sentence of sentences) {
        if (sentence.length > maxChars) {
            pushChunk();

            for (let start = 0; start < sentence.length; start += maxChars) {
                chunks.push(sentence.slice(start, start + maxChars).trim());
            }
            continue;
        }

        const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence;
        if (candidate.length > maxChars) {
            pushChunk();
            currentChunk = sentence;
        } else {
            currentChunk = candidate;
        }
    }

    pushChunk();
    return chunks;
}

export function buildNarrationSegmentScript(segment: NarrationSegmentSource, index: number) {
    const body = stripMarkdown(segment.markdown_body);
    if (!body) {
        return null;
    }

    const title = stripMarkdown(segment.title || "");
    const header = title ? `${title}.` : `Section ${index + 1}.`;
    return `${header}\n\n${body}`;
}

export function buildNarrationScript(content: NarrationContentSource) {
    const segments = content.segments
        .map((segment, index) => buildNarrationSegmentScript(segment, index))
        .filter((segment): segment is string => Boolean(segment));

    const script = normalizeWhitespace(segments.join("\n\n"));

    if (!script) {
        throw new NarrationError({
            code: "NARRATION_EMPTY",
            status: 400,
            userMessage: "There is no deep-mode summary content available for narration.",
        });
    }

    return script;
}

export function splitNarrationIntoChunks(script: string, maxChars: number = MAX_CHARS_PER_CHUNK) {
    const paragraphs = normalizeWhitespace(script)
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    const chunks: string[] = [];
    let currentChunk = "";

    const pushChunk = () => {
        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }
    };

    for (const paragraph of paragraphs) {
        const paragraphParts = splitLongParagraph(paragraph, maxChars);

        for (const paragraphPart of paragraphParts) {
            const candidate = currentChunk ? `${currentChunk}\n\n${paragraphPart}` : paragraphPart;
            if (candidate.length > maxChars) {
                pushChunk();
                currentChunk = paragraphPart;
            } else {
                currentChunk = candidate;
            }
        }
    }

    pushChunk();
    return chunks;
}

function countWords(value: string) {
    const matches = value.match(/\b[\p{L}\p{N}'’-]+\b/gu);
    return matches?.length ?? 0;
}

function normalizeNarrationSpeed(speed?: number) {
    if (!Number.isFinite(speed) || !speed || speed <= 0) {
        return DEFAULT_NARRATION_SPEED;
    }

    return Math.min(Math.max(speed, 0.25), 4);
}

export function estimateNarrationCost(
    content: NarrationContentSource,
    options?: { speed?: number }
): NarrationCostEstimate {
    const script = buildNarrationScript(content);
    const scriptCharacters = script.length;
    const scriptWords = countWords(script);
    const chunkCount = splitNarrationIntoChunks(script).length;
    const speed = normalizeNarrationSpeed(options?.speed);
    const estimatedDurationSeconds = Math.max(
        1,
        Math.round((scriptWords / ESTIMATED_NARRATION_WORDS_PER_MINUTE) * 60 / speed)
    );
    const estimatedCostUsd = Number(
        ((estimatedDurationSeconds / 60) * ESTIMATED_GPT_4O_MINI_TTS_COST_PER_MINUTE_USD).toFixed(4)
    );

    return {
        model: OPENAI_TTS_MODEL,
        speed,
        scriptCharacters,
        scriptWords,
        chunkCount,
        estimatedDurationSeconds,
        estimatedCostUsd,
    };
}
