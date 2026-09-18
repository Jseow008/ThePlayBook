/** Three-call synthetic development check. No-network plan unless --execute is explicit. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { formatRankedPersonalEvidence, type RankedPersonalEvidence } from "../lib/server/personal-evidence-ranking";
import { buildPersonalEvidencePrompt } from "../lib/server/personal-retrieval";
import { DEFAULT_ANTHROPIC_MODEL, getNotesAnthropicModelName, getNotesOutputTokenCap } from "../lib/server/retrieval-generation";
import type { PersonalEvidenceCandidate } from "../lib/personal-evidence";

const fixturePath = "tests/fixtures/retrieval/development/attribution-journey-v1.json";
const fixture = JSON.parse(readFileSync(resolve(fixturePath), "utf8")) as {
    version: string; question: string; sourceTitle: string; highlight: string; note: string; prompt: string; reflection: string; reviewCriteria: string[];
};
const hashes = Object.fromEntries([fixturePath, "scripts/probe-personal-attribution.ts", "lib/server/personal-evidence-ranking.ts", "lib/server/personal-retrieval.ts", "lib/server/retrieval-generation.ts"]
    .map(path => [path, createHash("sha256").update(readFileSync(resolve(path))).digest("hex")]));
const common = { userId: "synthetic-account", contentItemId: "synthetic-content", createdAt: null, updatedAt: null,
    fingerprint: "synthetic", sourceStatus: "available" as const,
    source: { id: "synthetic-content", title: fixture.sourceTitle, author: null, updatedAt: "2026-09-18T00:00:00Z" } };
const highlight: PersonalEvidenceCandidate = { ...common, type: "highlight", evidenceId: "highlight:journey", id: "journey",
    highlightedText: fixture.highlight, noteBody: fixture.note, color: "blue", segmentId: null, segment: null,
    anchorStart: 0, anchorEnd: fixture.highlight.length, readerAnchor: null };
const reflection: PersonalEvidenceCandidate = { ...common, type: "reflection", evidenceId: "reflection:journey", id: "journey",
    prompt: fixture.prompt, reflectionText: fixture.reflection };
const ranked: RankedPersonalEvidence[] = [
    { evidence: highlight, score: 1, exactQuote: null, spans: [
        { field: "highlightedText", start: 0, end: fixture.highlight.length, text: fixture.highlight, score: 1 },
        { field: "noteBody", start: 0, end: fixture.note.length, text: fixture.note, score: 1 },
    ] },
    { evidence: reflection, score: 1, exactQuote: null, spans: [
        { field: "prompt", start: 0, end: fixture.prompt.length, text: fixture.prompt, score: 1 },
        { field: "reflectionText", start: 0, end: fixture.reflection.length, text: fixture.reflection, score: 1 },
    ] },
];
const formatted = formatRankedPersonalEvidence(ranked);
const system = buildPersonalEvidencePrompt({ ...formatted, candidateCount: 2 });
const maximumOutputTokens = getNotesOutputTokenCap(fixture.question);
async function main() {
    const productionModel = getNotesAnthropicModelName(fixture.question);
    const modelId = process.argv.find(arg => arg.startsWith("--model="))?.slice(8) ?? productionModel;
    if (![DEFAULT_ANTHROPIC_MODEL, "claude-sonnet-4-6"].includes(modelId)) throw new Error("Unsupported diagnostic model");
    const plan = { version: fixture.version, model: modelId, modelOverride: modelId !== productionModel, maximumCalls: 3, maximumOutputTokens,
        contextBytes: formatted.contextBytes, moduleHashes: hashes };
    if (!process.argv.includes("--execute")) { console.log(JSON.stringify({ ...plan, mode: "plan", providerCallsMade: 0 }, null, 2)); return; }
    const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
    if (!output) throw new Error("An explicit output path is required");
    // Establish a writable, new checkpoint before spending any provider input.
    writeFileSync(resolve(output), JSON.stringify({ ...plan, mode: "real-provider development diagnostic", records: [] }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    const envFile = process.argv.find(arg => arg.startsWith("--env-file="))?.slice(11) ?? resolve(".env.local");
    const key = process.env.ANTHROPIC_API_KEY || parse(readFileSync(envFile)).ANTHROPIC_API_KEY;
    if (!key || key.includes("[SENSITIVE]")) throw new Error("Provider configuration unavailable");
    const model = createAnthropic({ apiKey: key })(modelId);
    const records: unknown[] = [];
    for (let run = 1; run <= 3; run++) {
        const started = performance.now();
        try {
            const response = await generateText({ model, system, messages: [{ role: "user", content: fixture.question }],
                maxOutputTokens: maximumOutputTokens, maxRetries: 0, abortSignal: AbortSignal.timeout(40_000) });
            records.push({ run, outcome: "complete", durationMs: performance.now() - started,
                responseText: response.text, responseSha256: createHash("sha256").update(response.text).digest("hex"),
                modelId: response.response.modelId, responseId: response.response.id, finishReason: response.finishReason,
                usage: response.usage, independentReview: "pending" });
        } catch {
            records.push({ run, outcome: "provider_failure", durationMs: performance.now() - started });
            break;
        } finally {
            writeFileSync(resolve(output), JSON.stringify({ ...plan, mode: "real-provider development diagnostic",
                fixture, systemPrompt: system, records, releaseGate: "Not established: frozen quality and independent answer review remain separate.",
                monetaryCost: null, costNote: "Measured usage retained; no unverified token-price estimate." }, null, 2) + "\n", { mode: 0o600 });
        }
    }
    console.log(JSON.stringify({ outputPath: resolve(output), attemptedCalls: records.length }));
}
main().catch(() => { console.error("Attribution probe failed; raw provider errors withheld."); process.exitCode = 1; });
