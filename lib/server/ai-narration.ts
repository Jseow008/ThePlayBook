import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { existsSync, chmodSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
    OPENAI_TTS_MODEL,
    OPENAI_TTS_VOICE,
    NarrationError,
    buildNarrationSegmentScript,
    isNarrationError,
    normalizeWhitespace,
    splitNarrationIntoChunks,
    type NarrationContentSource,
    type GeneratedNarrationSegmentTiming,
} from "@/lib/server/narration-script";

export {
    NarrationError,
    buildNarrationSegmentScript,
    buildNarrationScript,
    estimateNarrationCost,
    isNarrationError,
    splitNarrationIntoChunks,
    type NarrationContentSource,
    type NarrationSegmentSource,
    type GeneratedNarrationSegmentTiming,
} from "@/lib/server/narration-script";

const OPENAI_WAV_FORMAT = "wav";
const FINAL_AUDIO_FORMAT = "mp3";
const FINAL_AUDIO_CONTENT_TYPE = "audio/mpeg";
const TTS_CONCURRENCY = 3;
const OPENAI_REQUEST_TIMEOUT_MS = 45_000;
const OPENAI_MAX_ATTEMPTS = 3;
const FFMPEG_TRANSCODE_TIMEOUT_MS = 60_000;
const RETRYABLE_OPENAI_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const require = createRequire(import.meta.url);

function shouldPreferWavOutput() {
    const requestedFormat = process.env.NARRATION_OUTPUT_FORMAT?.trim().toLowerCase();
    return requestedFormat === OPENAI_WAV_FORMAT;
}

function shouldAllowWavFallback() {
    return process.env.NARRATION_ALLOW_WAV_FALLBACK?.trim().toLowerCase() === "true";
}

function resolveFfmpegBinaryPath() {
    const explicitPath = process.env.FFMPEG_BIN?.trim();
    if (explicitPath) {
        return explicitPath;
    }

    const executableName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
    const candidates = new Set<string>();

    try {
        const packageJsonPath = require.resolve("ffmpeg-static/package.json");
        const packageDir = path.dirname(packageJsonPath);
        candidates.add(path.join(packageDir, executableName));
    } catch {
        // Continue to traced fallbacks below.
    }

    candidates.add(path.join(".next", "server", "node_modules", "ffmpeg-static", executableName));
    candidates.add(path.join("node_modules", "ffmpeg-static", executableName));

    for (const candidate of candidates) {
        if (candidate && existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
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

export function getWavDurationSeconds(wavBuffer: Buffer) {
    const chunk = parseWavChunk(wavBuffer);
    return chunk.pcmData.byteLength / chunk.byteRate;
}

export async function transcodeWavToMp3(wavBuffer: Buffer) {
    const ffmpegBinaryPath = resolveFfmpegBinaryPath();
    if (!ffmpegBinaryPath) {
        throw new NarrationError({
            code: "FFMPEG_NOT_AVAILABLE",
            status: 500,
            userMessage: "AI narration is not configured correctly right now.",
            message: "ffmpeg-static did not provide a usable binary path.",
        });
    }

    if (process.platform !== "win32") {
        try {
            chmodSync(ffmpegBinaryPath, 0o755);
        } catch {
            // Ignore chmod failures and let spawn surface the real execution error if needed.
        }
    }

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

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
            return;
        }

        const timeout = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);

        const handleAbort = () => {
            cleanup();
            reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        };

        const cleanup = () => {
            clearTimeout(timeout);
            signal?.removeEventListener("abort", handleAbort);
        };

        signal?.addEventListener("abort", handleAbort, { once: true });
    });
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

function getCombinedAbortSignal(signal?: AbortSignal) {
    if (!signal) {
        return AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS);
    }

    if (typeof AbortSignal.any === "function") {
        return AbortSignal.any([signal, AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS)]);
    }

    return AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS);
}

export async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number, signal: AbortSignal) => Promise<R>
) {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    let firstError: unknown = null;
    const abortController = new AbortController();

    async function worker() {
        while (!firstError && !abortController.signal.aborted && nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;

            try {
                results[currentIndex] = await mapper(items[currentIndex], currentIndex, abortController.signal);
            } catch (error) {
                if (!firstError) {
                    firstError = error;
                    abortController.abort(error);
                }
                break;
            }
        }
    }

    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    if (firstError) {
        throw firstError;
    }

    return results;
}

export async function synthesizeNarrationChunkWav(chunk: string, signal?: AbortSignal) {
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
                signal: getCombinedAbortSignal(signal),
            });

            if (!response.ok) {
                const providerMessage = await extractOpenAiError(response);
                const error = buildOpenAiHttpError(response.status, providerMessage);

                if (RETRYABLE_OPENAI_STATUSES.has(response.status) && attempt < OPENAI_MAX_ATTEMPTS) {
                    await delay(getRetryDelayMs(attempt), signal);
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
                await delay(getRetryDelayMs(attempt), signal);
                continue;
            }

            if (signal?.aborted) {
                throw new NarrationError({
                    code: "NARRATION_ABORTED",
                    status: 499,
                    userMessage: "AI narration generation was cancelled.",
                    cause: error,
                });
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
    const synthesizedSegments = [];
    let totalChunkCount = 0;
    let cumulativeSeconds = 0;
    let previousStoredEndSeconds = 0;

    for (const [index, segment] of content.segments.entries()) {
        const segmentScript = buildNarrationSegmentScript(segment, index);

        if (!segmentScript) {
            synthesizedSegments.push({
                id: segment.id ?? null,
                order_index: segment.order_index ?? index + 1,
                script: null,
                wavBuffer: null,
                start_time_sec: null,
                end_time_sec: null,
            });
            continue;
        }

        const chunks = splitNarrationIntoChunks(segmentScript);
        const wavChunks = await mapWithConcurrency(
            chunks,
            TTS_CONCURRENCY,
            async (chunk, _index, signal) => synthesizeNarrationChunkWav(chunk, signal)
        );

        const segmentWavBuffer = concatenateWavBuffers(wavChunks);
        const segmentDurationSeconds = getWavDurationSeconds(segmentWavBuffer);
        const exactEndSeconds = cumulativeSeconds + segmentDurationSeconds;
        const storedStartSeconds = previousStoredEndSeconds;
        const storedEndSeconds = Math.max(storedStartSeconds + 1, Math.round(exactEndSeconds));

        totalChunkCount += chunks.length;
        cumulativeSeconds = exactEndSeconds;
        previousStoredEndSeconds = storedEndSeconds;

        synthesizedSegments.push({
            id: segment.id ?? null,
            order_index: segment.order_index ?? index + 1,
            script: segmentScript,
            wavBuffer: segmentWavBuffer,
            start_time_sec: storedStartSeconds,
            end_time_sec: storedEndSeconds,
        });
    }

    const spokenSegments = synthesizedSegments.filter((segment) => segment.script && segment.wavBuffer);
    if (spokenSegments.length === 0) {
        throw new NarrationError({
            code: "NARRATION_EMPTY",
            status: 400,
            userMessage: "There is no deep-mode summary content available for narration.",
        });
    }

    const script = normalizeWhitespace(spokenSegments.map((segment) => segment.script).join("\n\n"));
    const wavBuffer = concatenateWavBuffers(spokenSegments.map((segment) => segment.wavBuffer as Buffer));
    const segmentTimings: GeneratedNarrationSegmentTiming[] = synthesizedSegments.map((segment) => ({
        id: segment.id,
        order_index: segment.order_index,
        start_time_sec: segment.start_time_sec,
        end_time_sec: segment.end_time_sec,
    }));

    if (shouldPreferWavOutput()) {
        return {
            script,
            chunkCount: totalChunkCount,
            segmentTimings,
            audioBuffer: wavBuffer,
            extension: OPENAI_WAV_FORMAT,
            contentType: "audio/wav",
        };
    }

    try {
        const audioBuffer = await transcodeWavToMp3(wavBuffer);

        return {
            script,
            chunkCount: totalChunkCount,
            segmentTimings,
            audioBuffer,
            extension: FINAL_AUDIO_FORMAT,
            contentType: FINAL_AUDIO_CONTENT_TYPE,
        };
    } catch (error) {
        if (!isNarrationError(error) || !error.code.startsWith("FFMPEG_")) {
            throw error;
        }

        if (!shouldAllowWavFallback()) {
            throw error;
        }

        return {
            script,
            chunkCount: totalChunkCount,
            segmentTimings,
            audioBuffer: wavBuffer,
            extension: OPENAI_WAV_FORMAT,
            contentType: "audio/wav",
        };
    }
}
