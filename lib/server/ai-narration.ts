import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";
const OPENAI_WAV_FORMAT = "wav";
const FINAL_AUDIO_FORMAT = "mp3";
const FINAL_AUDIO_CONTENT_TYPE = "audio/mpeg";
const MAX_CHARS_PER_CHUNK = 3_500;
const TTS_CONCURRENCY = 3;
const OPENAI_REQUEST_TIMEOUT_MS = 45_000;
const OPENAI_MAX_ATTEMPTS = 3;
const FFMPEG_TRANSCODE_TIMEOUT_MS = 60_000;
const RETRYABLE_OPENAI_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

export interface NarrationSegmentSource {
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

interface WavChunk {
    audioFormat: number;
    channels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bitsPerSample: number;
    pcmData: Buffer;
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

function normalizeWhitespace(value: string) {
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

export function buildNarrationScript(content: NarrationContentSource) {
    const segments = content.segments
        .map((segment, index) => {
            const body = stripMarkdown(segment.markdown_body);
            if (!body) return null;

            const title = stripMarkdown(segment.title || "");
            const header = title ? `${title}.` : `Section ${index + 1}.`;
            return `${header}\n\n${body}`;
        })
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

function findChunk(buffer: Buffer, chunkId: string, startOffset: number) {
    let offset = startOffset;

    while (offset + 8 <= buffer.byteLength) {
        const id = buffer.toString("ascii", offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const dataStart = offset + 8;
        const dataEnd = dataStart + size;

        if (id === chunkId) {
            return { offset, size, dataStart, dataEnd };
        }

        offset = dataEnd + (size % 2);
    }

    return null;
}

function parseWavChunk(buffer: Buffer): WavChunk {
    if (buffer.byteLength < 44) {
        throw new NarrationError({
            code: "INVALID_AUDIO_CHUNK",
            status: 502,
            userMessage: "The generated audio file could not be processed safely. Please try again.",
            message: "Generated WAV chunk is too small.",
        });
    }

    if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
        throw new NarrationError({
            code: "INVALID_AUDIO_CHUNK",
            status: 502,
            userMessage: "The generated audio file could not be processed safely. Please try again.",
            message: "Generated audio chunk is not a valid WAV file.",
        });
    }

    const fmtChunk = findChunk(buffer, "fmt ", 12);
    const dataChunk = findChunk(buffer, "data", 12);

    if (!fmtChunk || !dataChunk) {
        throw new NarrationError({
            code: "INVALID_AUDIO_CHUNK",
            status: 502,
            userMessage: "The generated audio file could not be processed safely. Please try again.",
            message: "Generated WAV chunk is missing required data.",
        });
    }

    return {
        audioFormat: buffer.readUInt16LE(fmtChunk.dataStart),
        channels: buffer.readUInt16LE(fmtChunk.dataStart + 2),
        sampleRate: buffer.readUInt32LE(fmtChunk.dataStart + 4),
        byteRate: buffer.readUInt32LE(fmtChunk.dataStart + 8),
        blockAlign: buffer.readUInt16LE(fmtChunk.dataStart + 12),
        bitsPerSample: buffer.readUInt16LE(fmtChunk.dataStart + 14),
        pcmData: buffer.subarray(dataChunk.dataStart, dataChunk.dataEnd),
    };
}

function createWavBuffer(chunk: WavChunk, pcmData: Buffer) {
    const header = Buffer.alloc(44);
    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(36 + pcmData.byteLength, 4);
    header.write("WAVE", 8, "ascii");
    header.write("fmt ", 12, "ascii");
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(chunk.audioFormat, 20);
    header.writeUInt16LE(chunk.channels, 22);
    header.writeUInt32LE(chunk.sampleRate, 24);
    header.writeUInt32LE(chunk.byteRate, 28);
    header.writeUInt16LE(chunk.blockAlign, 32);
    header.writeUInt16LE(chunk.bitsPerSample, 34);
    header.write("data", 36, "ascii");
    header.writeUInt32LE(pcmData.byteLength, 40);

    return Buffer.concat([header, pcmData]);
}

export function concatenateWavBuffers(wavBuffers: Buffer[]) {
    if (wavBuffers.length === 0) {
        throw new NarrationError({
            code: "INVALID_AUDIO_CHUNK",
            status: 502,
            userMessage: "The generated audio file could not be processed safely. Please try again.",
            message: "Cannot concatenate an empty narration track.",
        });
    }

    const parsedChunks = wavBuffers.map((buffer) => parseWavChunk(buffer));
    const [firstChunk, ...otherChunks] = parsedChunks;

    otherChunks.forEach((chunk) => {
        if (
            chunk.audioFormat !== firstChunk.audioFormat
            || chunk.channels !== firstChunk.channels
            || chunk.sampleRate !== firstChunk.sampleRate
            || chunk.byteRate !== firstChunk.byteRate
            || chunk.blockAlign !== firstChunk.blockAlign
            || chunk.bitsPerSample !== firstChunk.bitsPerSample
        ) {
            throw new NarrationError({
                code: "INVALID_AUDIO_CHUNK",
                status: 502,
                userMessage: "The generated audio file could not be processed safely. Please try again.",
                message: "Generated WAV chunks do not share the same audio format.",
            });
        }
    });

    const pcmData = Buffer.concat(parsedChunks.map((chunk) => chunk.pcmData));
    return createWavBuffer(firstChunk, pcmData);
}

export async function transcodeWavToMp3(wavBuffer: Buffer) {
    if (!ffmpegPath) {
        throw new NarrationError({
            code: "FFMPEG_NOT_AVAILABLE",
            status: 500,
            userMessage: "AI narration is not configured correctly right now.",
            message: "ffmpeg-static did not provide a usable binary path.",
        });
    }
    const ffmpegBinaryPath = ffmpegPath;

    return await new Promise<Buffer>((resolve, reject) => {
        const child = spawn(ffmpegBinaryPath, [
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "wav",
            "-i",
            "pipe:0",
            "-vn",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "64k",
            "-ac",
            "1",
            "-ar",
            "24000",
            "-f",
            "mp3",
            "pipe:1",
        ], {
            stdio: ["pipe", "pipe", "pipe"],
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new NarrationError({
                code: "FFMPEG_TIMEOUT",
                status: 504,
                userMessage: "AI narration timed out while finalizing audio. Please try again.",
                message: "Timed out while transcoding narration WAV to MP3.",
            }));
        }, FFMPEG_TRANSCODE_TIMEOUT_MS);

        child.stdout.on("data", (chunk: Buffer | string) => {
            stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        child.stderr.on("data", (chunk: Buffer | string) => {
            stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        child.on("error", (error) => {
            clearTimeout(timeout);
            reject(new NarrationError({
                code: "FFMPEG_EXECUTION_FAILED",
                status: 500,
                userMessage: "AI narration could not finalize the audio file right now.",
                message: "Failed to start ffmpeg for narration transcoding.",
                cause: error,
            }));
        });

        child.on("close", (code) => {
            clearTimeout(timeout);

            if (code !== 0) {
                reject(new NarrationError({
                    code: "FFMPEG_TRANSCODE_FAILED",
                    status: 502,
                    userMessage: "AI narration could not finalize the audio file right now.",
                    message: `ffmpeg failed to transcode narration WAV to MP3: ${Buffer.concat(stderrChunks).toString("utf8").trim() || `exit code ${code}`}`,
                }));
                return;
            }

            const output = Buffer.concat(stdoutChunks);
            if (output.byteLength === 0) {
                reject(new NarrationError({
                    code: "FFMPEG_EMPTY_OUTPUT",
                    status: 502,
                    userMessage: "AI narration could not finalize the audio file right now.",
                    message: "ffmpeg produced an empty MP3 output.",
                }));
                return;
            }

            resolve(output);
        });

        child.stdin.on("error", () => {
            // Ignored: ffmpeg may close stdin after consuming the WAV input.
        });

        child.stdin.end(wavBuffer);
    });
}

async function extractOpenAiError(response: Response) {
    const fallbackMessage = `OpenAI TTS request failed with status ${response.status}.`;

    try {
        const data = await response.json() as {
            error?: {
                message?: string;
            };
        };

        return data.error?.message || fallbackMessage;
    } catch {
        return fallbackMessage;
    }
}

function isAbortError(error: unknown) {
    return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function isRetryableFetchFailure(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return message.includes("fetch failed")
        || message.includes("network")
        || message.includes("timed out")
        || message.includes("timeout");
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt: number) {
    return Math.min(1_500 * 2 ** (attempt - 1), 6_000);
}

function buildOpenAiHttpError(status: number, providerMessage: string) {
    if (status === 400) {
        return new NarrationError({
            code: "OPENAI_BAD_REQUEST",
            status: 502,
            userMessage: "The AI voice provider rejected this narration request. Please review the content and try again.",
            message: `OpenAI rejected narration request: ${providerMessage}`,
        });
    }

    if (status === 401 || status === 403) {
        return new NarrationError({
            code: "OPENAI_AUTH",
            status: 500,
            userMessage: "AI narration is not configured correctly right now.",
            message: `OpenAI authentication failed: ${providerMessage}`,
        });
    }

    if (status === 429) {
        return new NarrationError({
            code: "OPENAI_RATE_LIMIT",
            status: 503,
            userMessage: "The AI voice provider is busy right now. Please try again in a moment.",
            message: `OpenAI rate limited narration request: ${providerMessage}`,
        });
    }

    if (RETRYABLE_OPENAI_STATUSES.has(status)) {
        return new NarrationError({
            code: "OPENAI_TEMPORARY",
            status: 503,
            userMessage: "The AI voice provider is temporarily unavailable. Please try again.",
            message: `OpenAI temporary narration failure (${status}): ${providerMessage}`,
        });
    }

    return new NarrationError({
        code: "OPENAI_UNKNOWN",
        status: 502,
        userMessage: "The AI voice provider could not generate narration for this summary.",
        message: `OpenAI narration request failed (${status}): ${providerMessage}`,
    });
}

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>
) {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

export async function synthesizeNarrationChunkWav(chunk: string) {
    if (!process.env.OPENAI_API_KEY) {
        throw new NarrationError({
            code: "OPENAI_NOT_CONFIGURED",
            status: 500,
            userMessage: "AI narration is not configured right now.",
        });
    }

    for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetch("https://api.openai.com/v1/audio/speech", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: OPENAI_TTS_MODEL,
                    voice: OPENAI_TTS_VOICE,
                    input: chunk,
                    response_format: OPENAI_WAV_FORMAT,
                }),
                signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
            });

            if (!response.ok) {
                const providerMessage = await extractOpenAiError(response);
                const error = buildOpenAiHttpError(response.status, providerMessage);

                if (RETRYABLE_OPENAI_STATUSES.has(response.status) && attempt < OPENAI_MAX_ATTEMPTS) {
                    await delay(getRetryDelayMs(attempt));
                    continue;
                }

                throw error;
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error) {
            if (error instanceof NarrationError) {
                throw error;
            }

            const isRetryable = isAbortError(error) || isRetryableFetchFailure(error);

            if (isRetryable && attempt < OPENAI_MAX_ATTEMPTS) {
                await delay(getRetryDelayMs(attempt));
                continue;
            }

            if (isAbortError(error)) {
                throw new NarrationError({
                    code: "OPENAI_TIMEOUT",
                    status: 504,
                    userMessage: "AI narration timed out while generating audio. Please try again.",
                    cause: error,
                });
            }

            throw new NarrationError({
                code: "OPENAI_NETWORK",
                status: 503,
                userMessage: "The AI voice provider could not be reached right now. Please try again.",
                cause: error,
            });
        }
    }

    throw new NarrationError({
        code: "OPENAI_UNKNOWN",
        status: 503,
        userMessage: "AI narration could not be completed right now. Please try again.",
    });
}

export async function generateNarrationAudio(content: NarrationContentSource) {
    const script = buildNarrationScript(content);
    const chunks = splitNarrationIntoChunks(script);
    const wavChunks = await mapWithConcurrency(
        chunks,
        TTS_CONCURRENCY,
        async (chunk) => synthesizeNarrationChunkWav(chunk)
    );

    const wavBuffer = concatenateWavBuffers(wavChunks);
    const audioBuffer = await transcodeWavToMp3(wavBuffer);

    return {
        script,
        chunkCount: chunks.length,
        audioBuffer,
        extension: FINAL_AUDIO_FORMAT,
        contentType: FINAL_AUDIO_CONTENT_TYPE,
    };
}
