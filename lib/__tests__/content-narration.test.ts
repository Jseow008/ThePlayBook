import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildNarrationScript,
    concatenateWavBuffers,
    splitNarrationIntoChunks,
    synthesizeNarrationChunkWav,
    transcodeWavToMp3,
} from "@/lib/server/ai-narration";

describe("AI narration helpers", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    const makeWav = (sampleA: number, sampleB: number) => {
        const wav = Buffer.alloc(48);
        wav.write("RIFF", 0, "ascii");
        wav.writeUInt32LE(40, 4);
        wav.write("WAVE", 8, "ascii");
        wav.write("fmt ", 12, "ascii");
        wav.writeUInt32LE(16, 16);
        wav.writeUInt16LE(1, 20);
        wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(24_000, 24);
        wav.writeUInt32LE(48_000, 28);
        wav.writeUInt16LE(2, 32);
        wav.writeUInt16LE(16, 34);
        wav.write("data", 36, "ascii");
        wav.writeUInt32LE(4, 40);
        wav.writeUInt16LE(sampleA, 44);
        wav.writeUInt16LE(sampleB, 46);
        return wav;
    };

    it("builds a speech-friendly narration script from deep-mode segments only", () => {
        const script = buildNarrationScript({
            title: "Deep Work",
            author: "Cal Newport",
            quick_mode_json: {
                hook: "Focus is a superpower.",
                big_idea: "Shallow work erodes meaningful output.",
                key_takeaways: ["Protect blocks of focus", "Reduce distractions"],
            },
            segments: [
                {
                    title: "Why focus matters",
                    markdown_body: "## Attention\n\n- Deep work compounds.\n- Context switching hurts.",
                },
            ],
        });

        expect(script).toContain("Why focus matters.");
        expect(script).toContain("Attention");
        expect(script).toContain("Deep work compounds.");
        expect(script).toContain("Context switching hurts.");
        expect(script).not.toContain("This is an AI-generated narration");
        expect(script).not.toContain("Cal Newport");
        expect(script).not.toContain("Focus is a superpower.");
        expect(script).not.toContain("Big idea.");
        expect(script).not.toContain("Protect blocks of focus");
        expect(script).not.toContain("##");
        expect(script).not.toContain("- ");
    });

    it("chunks long narration scripts into bounded pieces", () => {
        const script = [
            "First paragraph with a concise sentence.",
            "Second paragraph with a lot more words that should force the helper to split the narration into multiple chunks without breaking the content entirely.",
            "Third paragraph closes it out cleanly.",
        ].join("\n\n");

        const chunks = splitNarrationIntoChunks(script, 80);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.length <= 80)).toBe(true);
    });

    it("concatenates WAV chunks into a single valid WAV file", () => {
        const wav = concatenateWavBuffers([
            makeWav(1, 2),
            makeWav(3, 4),
        ]);

        expect(Buffer.isBuffer(wav)).toBe(true);
        expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
        expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
        expect(wav.readUInt32LE(40)).toBe(8);
        expect(wav.readUInt16LE(44)).toBe(1);
        expect(wav.readUInt16LE(46)).toBe(2);
        expect(wav.readUInt16LE(48)).toBe(3);
        expect(wav.readUInt16LE(50)).toBe(4);
    });

    it("transcodes the merged WAV narration into an MP3 asset", async () => {
        const wav = concatenateWavBuffers([
            makeWav(1, 2),
            makeWav(3, 4),
        ]);

        const mp3 = await transcodeWavToMp3(wav);

        expect(Buffer.isBuffer(mp3)).toBe(true);
        expect(mp3.byteLength).toBeGreaterThan(0);
        const hasId3Header = mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33;
        const hasMpegFrameHeader = mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0;
        expect(hasId3Header || hasMpegFrameHeader).toBe(true);
    });

    it("retries temporary OpenAI failures before succeeding", async () => {
        vi.useFakeTimers();
        vi.stubEnv("OPENAI_API_KEY", "test-openai-key");

        const wavBuffer = makeWav(7, 9);
        const arrayBuffer = wavBuffer.buffer.slice(
            wavBuffer.byteOffset,
            wavBuffer.byteOffset + wavBuffer.byteLength
        );

        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 503,
                json: async () => ({
                    error: {
                        message: "upstream outage",
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                arrayBuffer: async () => arrayBuffer,
            }) as any;

        const bufferPromise = synthesizeNarrationChunkWav("Narrate this chunk.");
        await vi.runAllTimersAsync();
        const audioBuffer = await bufferPromise;

        expect(Buffer.isBuffer(audioBuffer)).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("maps repeated timeout failures to a safe narration error", async () => {
        vi.useFakeTimers();
        vi.stubEnv("OPENAI_API_KEY", "test-openai-key");

        global.fetch = vi.fn().mockRejectedValue(Object.assign(new Error("Request timed out"), {
            name: "TimeoutError",
        })) as any;

        const expectation = expect(
            synthesizeNarrationChunkWav("Narrate this chunk.")
        ).rejects.toMatchObject({
            code: "OPENAI_TIMEOUT",
            status: 504,
            userMessage: "AI narration timed out while generating audio. Please try again.",
        });

        await vi.runAllTimersAsync();
        await expectation;
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });
});
