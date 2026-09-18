/** Neutral generation-only development probe; no retrieval or production prompt edits. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { formatRankedPersonalEvidence, type RankedPersonalEvidence } from "../lib/server/personal-evidence-ranking";
import { buildPersonalEvidencePrompt } from "../lib/server/personal-retrieval";
import { composeLibraryEvidence, buildLibraryEvidencePrompt, type LibrarySourceEvidence } from "../lib/server/library-evidence";
import { detectAskIntent, getAnthropicModelName, getOutputTokenCap, getNotesAnthropicModelName, getNotesOutputTokenCap } from "../lib/server/retrieval-generation";
import { safeProviderFailure } from "./evaluate-personal-retrieval";

type Field = { name: "sourceText" | "highlightedText" | "noteBody" | "prompt" | "reflectionText"; text: string };
type Case = { id: string; surface: "notes" | "library"; question: string; libraryMetadata: string | null;
    evidence: Array<{ id: string; type: "highlight" | "reflection" | "source_segment"; title: string; fields: Field[] }>;
    expectedGeneration: { model: string; maxOutputTokens: number } };
const fixturePath = "tests/fixtures/retrieval/development/grounded-answers-v1.json";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const rawFixture = readFileSync(resolve(fixturePath));
const fixture = JSON.parse(rawFixture.toString()) as { status: string; proposedPromptAppendix: string; cases: Case[] };
const moduleHashes = Object.fromEntries([fixturePath, "scripts/probe-grounded-answers.ts", "lib/server/personal-evidence-ranking.ts", "lib/server/personal-retrieval.ts", "lib/server/library-evidence.ts", "lib/server/retrieval-generation.ts"].map(path => [path, sha(readFileSync(resolve(path)))]));
function prepare(item: Case) {
    const personal: RankedPersonalEvidence[] = []; const sources: LibrarySourceEvidence[] = [];
    for (const row of item.evidence) {
        const field = (name: Field["name"]) => row.fields.find(f => f.name === name)?.text ?? "";
        if (row.type === "source_segment") {
            const text = field("sourceText"); sources.push({ type: row.type, evidenceId: row.id, id: row.id.split(":")[1], contentItemId: row.id,
                title: row.title, text, fingerprint: sha(text), score: 1, span: { text, start: 0, end: text.length } }); continue;
        }
        const common = { userId: "synthetic-development-account", contentItemId: row.id, evidenceId: row.id, id: row.id.split(":")[1],
            createdAt: null, updatedAt: null, fingerprint: "synthetic", sourceStatus: "available" as const,
            source: { id: row.id, title: row.title, author: null, updatedAt: "2026-09-19T00:00:00Z" } };
        const evidence = row.type === "highlight" ? { ...common, type: row.type, highlightedText: field("highlightedText"), noteBody: field("noteBody") || null,
            color: "blue", segmentId: null, segment: null, anchorStart: 0, anchorEnd: field("highlightedText").length, readerAnchor: null }
            : { ...common, type: row.type, prompt: field("prompt"), reflectionText: field("reflectionText") };
        personal.push({ evidence, score: 1, exactQuote: null, spans: row.fields.filter(f => f.name !== "sourceText").map(f => ({
            field: f.name as "highlightedText" | "noteBody" | "prompt" | "reflectionText", start: 0, end: f.text.length, text: f.text, score: 1 })) });
    }
    const formatted = formatRankedPersonalEvidence(personal);
    const intent = detectAskIntent(item.question);
    const model = item.surface === "notes" ? getNotesAnthropicModelName(item.question) : getAnthropicModelName(intent);
    const maxOutputTokens = item.surface === "notes" ? getNotesOutputTokenCap(item.question) : getOutputTokenCap(intent);
    const context = item.surface === "notes" ? formatted.contextText : composeLibraryEvidence({ items: personal } as Parameters<typeof composeLibraryEvidence>[0], sources, item.evidence.map(e => e.id)).contextText;
    const system = item.surface === "notes" ? buildPersonalEvidencePrompt({ ...formatted, candidateCount: personal.length })
        : buildLibraryEvidencePrompt(item.libraryMetadata ?? "", context, intent);
    if (model !== item.expectedGeneration.model || maxOutputTokens !== item.expectedGeneration.maxOutputTokens || Buffer.byteLength(context) > 4000) throw new Error("Production configuration differs from frozen development proposal");
    return { caseId: item.id, query: item.question, model, maxOutputTokens, context, system };
}
async function main() {
    const prepared = fixture.cases.map(prepare);
    const plan = { mode: "neutral-generation-development-plan", fixtureSha256: sha(rawFixture), moduleHashes, maximumCalls: prepared.length * 4,
        conditions: { baseline: 1, candidate: 3 }, maximumOutputTokens: prepared.reduce((n, item) => n + item.maxOutputTokens * 4, 0),
        retries: 0, timeoutMs: 60_000, prepared, appendix: fixture.proposedPromptAppendix, releaseGate: "Not established by development probes." };
    if (!process.argv.includes("--execute")) { console.log(JSON.stringify(plan, null, 2)); return; }
    // Archive guard: changed production prompts require a new, independently reviewed development version.
    const frozenProductionHashes: Record<string, string> = {
    "lib/server/personal-evidence-ranking.ts": "4cd8d31356c369cf3c0e4bd5b1e6cf010a98d015b9fcdcaf2d7fca8eb23be15d",
    "lib/server/personal-retrieval.ts": "034166595633a176c2bfb7dd3a3882b3e5097d7135041559ddfd53a3f05c995b",
    "lib/server/library-evidence.ts": "a7d14adf62318e349210ed4179bebd95a1a30b7949c60749bd4a927adda21bfc",
    "lib/server/retrieval-generation.ts": "a9e4f6af42c980a16b3c4895ba817e0d44518592ee904a8ca2e2c45b31c56dfa"
};
    if (Object.entries(frozenProductionHashes).some(([path, hash]) => moduleHashes[path] !== hash)) throw new Error("Archived development baseline changed; create a new reviewed probe version");
    const expectedHash = process.argv.find(a => a.startsWith("--fixture-sha="))?.slice(14);
    if (expectedHash !== plan.fixtureSha256 || !fixture.status.includes("frozen") || prepared.length !== 6) throw new Error("Explicit frozen fixture hash required");
    const output = process.argv.find(a => a.startsWith("--output="))?.slice(9);
    if (!output) throw new Error("New output path required");
    const records: unknown[] = []; let failure: unknown = null;
    const save = () => writeFileSync(resolve(output), JSON.stringify({ ...plan, mode: "real-provider-neutral-generation-development", records, failure,
        review: "Pending independent adjudication; no automatic pass", monetaryCost: null, costNote: "Actual token usage retained; no unverified pricing estimate." }, null, 2) + "\n", { mode: 0o600 });
    writeFileSync(resolve(output), "{}\n", { flag: "wx", mode: 0o600 }); save();
    const envFile = process.argv.find(a => a.startsWith("--env-file="))?.slice(11) ?? resolve(".env.local");
    const key = process.env.ANTHROPIC_API_KEY || parse(readFileSync(envFile)).ANTHROPIC_API_KEY;
    if (!key || key.includes("[SENSITIVE]")) throw new Error("Provider configuration unavailable");
    const anthropic = createAnthropic({ apiKey: key });
    for (const input of prepared) for (const condition of ["baseline", "candidate"] as const) for (let run = 1; run <= (condition === "baseline" ? 1 : 3); run++) {
        const system = input.system + (condition === "candidate" ? `\n\n${fixture.proposedPromptAppendix}` : "");
        const started = performance.now();
        try {
            const response = await generateText({ model: anthropic(input.model), system, prompt: input.query, maxOutputTokens: input.maxOutputTokens,
                maxRetries: 0, abortSignal: AbortSignal.timeout(60_000) });
            records.push({ caseId: input.caseId, condition, run, outcome: "complete", systemSha256: sha(system), responseText: response.text,
                responseSha256: sha(response.text), modelId: response.response.modelId, responseId: response.response.id, usage: response.usage,
                finishReason: response.finishReason, durationMs: Math.round(performance.now() - started) });
            if (response.response.modelId !== input.model || response.finishReason === "length") throw new Error("Provider model mismatch or truncated output");
        } catch (error) {
            failure = safeProviderFailure(error); records.push({ caseId: input.caseId, condition, run, outcome: "operational_failure", failure }); save(); throw error;
        }
        save(); await new Promise(r => setTimeout(r, 2_000));
    }
    console.log(JSON.stringify({ output, completed: records.length }));
}
main().catch(() => { console.error("Development probe stopped; inspect safe checkpoint."); process.exitCode = 1; });
