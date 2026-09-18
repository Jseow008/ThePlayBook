/** Synthetic development diagnostic. Default is a no-network plan; --execute permits at most six selector calls. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import { selectPersonalEvidence, generatePersonalEvidenceSelection, PersonalEvidenceSelectionError,
    buildPersonalEvidenceSelectionRequest, personalEvidenceSelectionRequestHash, PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG,
    type PersonalEvidenceSelectionCandidate, type PersonalEvidenceSelectionGenerator,
    type PersonalEvidenceSelectionModelConfig } from "../lib/server/personal-evidence-selector";

export type SelectorDevelopmentCase = {
    id: string; question: string; exactQuote: boolean; expectedIds: string[];
    candidates: PersonalEvidenceSelectionCandidate[];
};
const DEVELOPMENT_FIXTURES = {
    "selector-neutral-v1.json": "selector-neutral-development-v1",
    "selector-precision-v1.json": "selector-precision-development-v1",
} as const;
export function selectorDevelopmentModelConfig(model = PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG.model as string): PersonalEvidenceSelectionModelConfig {
    if (!["claude-haiku-4-5-20251001", "claude-sonnet-4-6"].includes(model)) throw new Error("Unsupported development comparison model");
    return { ...PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG, model };
}
export function readSelectorDevelopmentFixture(name = "selector-neutral-v1.json") {
    if (!Object.hasOwn(DEVELOPMENT_FIXTURES, name)) throw new Error("Only the named synthetic development fixtures are accepted");
    const raw = readFileSync(resolve("tests/fixtures/retrieval/development", name), "utf8");
    const fixture = JSON.parse(raw) as { version: string; purpose: string; cases: SelectorDevelopmentCase[] };
    if (fixture.version !== DEVELOPMENT_FIXTURES[name as keyof typeof DEVELOPMENT_FIXTURES] || fixture.cases.length !== 6) throw new Error("Unexpected selector development fixture");
    return { ...fixture, sha256: createHash("sha256").update(raw).digest("hex") };
}
export function prepareSelectorDevelopmentArtifact(output: string, checkpoint: Record<string, unknown>) {
    const destination = resolve(output);
    // Exclusive creation tests the directory, write permission and nonexistence
    // before generation; an incomplete artifact is evidence of an interrupted run.
    writeFileSync(destination, JSON.stringify({ ...checkpoint, records: [] }, null, 2) + "\n", { flag: "wx" });
    return (records: readonly unknown[]) => {
        writeFileSync(destination, JSON.stringify({ ...checkpoint, records }, null, 2) + "\n");
    };
}
export async function runSelectorDevelopmentProbe(options: {
    generate?: PersonalEvidenceSelectionGenerator; cases?: SelectorDevelopmentCase[]; signal?: AbortSignal; fixtureName?: string;
    onProgress?: (records: readonly unknown[]) => void; model?: string;
} = {}) {
    const fixture = readSelectorDevelopmentFixture(options.fixtureName);
    const modelConfig = selectorDevelopmentModelConfig(options.model);
    if (!options.generate && (process.env.AI_PROVIDER !== modelConfig.provider || process.env.AI_MODEL !== modelConfig.model)) {
        throw new Error("Provider environment must match the recorded development model configuration");
    }
    const cases = options.cases ?? fixture.cases;
    if (cases.length > 6) throw new Error("Development probe call budget exceeded");
    const records = [];
    for (const testCase of cases) {
        const prepared = buildPersonalEvidenceSelectionRequest(testCase);
        const inputSha256 = personalEvidenceSelectionRequestHash(prepared.canonical, modelConfig);
        const systemPromptSha256 = createHash("sha256").update(prepared.request.system).digest("hex");
        let rawOutput: unknown = null;
        let usage: unknown = null;
        let actualCalls = 0;
        let stopAfterRecord = false;
        const generate: PersonalEvidenceSelectionGenerator = async request => {
            actualCalls++;
            if (actualCalls > 1) throw new Error("Development probe does not retry");
            const response = await (options.generate ?? generatePersonalEvidenceSelection)(request);
            // This runner accepts only the local synthetic fixture; never use it with production captures.
            const serialized = JSON.stringify(response.output);
            rawOutput = serialized.length <= 8_000 ? response.output : { truncated: true };
            usage = response.usage ?? null;
            return response;
        };
        try {
            const result = await selectPersonalEvidence({ question: testCase.question, candidates: testCase.candidates,
                exactQuote: testCase.exactQuote, signal: options.signal, generate });
            const passed = result.ids.length === testCase.expectedIds.length && testCase.expectedIds.every(id => result.ids.includes(id));
            records.push({ caseId: testCase.id, outcome: "complete", passed, inputSha256, systemPromptSha256, expectedIds: testCase.expectedIds,
                selectedIds: result.ids, rawSyntheticOutput: rawOutput, actualCalls, usage: result.usage,
                model: result.model, provider: result.provider, promptVersion: result.promptVersion, stats: result.stats });
        } catch (error) {
            records.push({ caseId: testCase.id, outcome: "error", passed: false, inputSha256, systemPromptSha256, expectedIds: testCase.expectedIds,
                selectedIds: [], rawSyntheticOutput: rawOutput, actualCalls, usage,
                error: error instanceof PersonalEvidenceSelectionError ? error.code : "PROBE_UNAVAILABLE" });
            // Do not turn a provider outage into six rapid repeated requests.
            stopAfterRecord = true;
        }
        options.onProgress?.([...records]);
        if (stopAfterRecord) break;
    }
    return { version: fixture.version, fixtureSha256: fixture.sha256, modelConfig,
        modelOverride: modelConfig.model !== PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG.model,
        evidenceKind: options.generate ? "injected-generator structural proof only" : "real-provider development diagnostic",
        expectedCases: cases.length, completedCases: records.length, passedCases: records.filter(record => record.passed).length,
        actualCalls: records.reduce((sum, record) => sum + record.actualCalls, 0),
        pricing: { estimatedUsd: null, reason: "Report measured token usage; no unverified model price or fabricated cost estimate." },
        releaseGate: "Not established. Frozen corpus, three-run quality, database authorization and answer attribution gates remain separate.", records };
}

async function main() {
    const fixtureName = process.argv.find(arg => arg.startsWith("--fixture="))?.slice("--fixture=".length);
    const fixture = readSelectorDevelopmentFixture(fixtureName);
    const modelConfig = selectorDevelopmentModelConfig(process.argv.find(arg => arg.startsWith("--model="))?.slice("--model=".length));
    if (!process.argv.includes("--execute")) {
        console.log(JSON.stringify({ mode: "plan", fixtureSha256: fixture.sha256, modelConfig, caseIds: fixture.cases.map(item => item.id),
            maximumProviderCalls: 6, maximumOutputTokensPerCall: 700, providerCallsMade: 0 }, null, 2));
    } else {
        const output = process.argv.find(arg => arg.startsWith("--output="))?.slice("--output=".length);
        if (!output) throw new Error("Explicit --output path required for a provider run");
        if (existsSync(resolve(output))) throw new Error("Refusing to overwrite an existing development artifact");
        const envFile = process.argv.find(arg => arg.startsWith("--env-file="))?.slice("--env-file=".length) ?? resolve(".env.local");
        const key = process.env.ANTHROPIC_API_KEY || parse(readFileSync(envFile)).ANTHROPIC_API_KEY;
        if (!key || key.includes("[SENSITIVE]")) throw new Error("Provider configuration unavailable");
        // Load only the requested provider key. An explicit diagnostic model
        // override never changes the production selector's default.
        process.env.ANTHROPIC_API_KEY = key;
        process.env.AI_PROVIDER = modelConfig.provider;
        process.env.AI_MODEL = modelConfig.model;
        const checkpoint = { version: fixture.version, fixtureSha256: fixture.sha256,
            modelConfig,
            outcome: "incomplete-development-diagnostic", expectedCases: fixture.cases.length, maximumProviderCalls: 6 };
        // Establish a writable, new artifact before any provider call. Preserve
        // each response immediately so a later interruption cannot erase usage.
        const onProgress = prepareSelectorDevelopmentArtifact(output, checkpoint);
        const report = await runSelectorDevelopmentProbe({ fixtureName, onProgress, model: modelConfig.model });
        writeFileSync(resolve(output), JSON.stringify(report, null, 2) + "\n");
        console.log(JSON.stringify({ reportPath: resolve(output), completedCases: report.completedCases, passedCases: report.passedCases, actualCalls: report.actualCalls }));
        if (report.passedCases !== report.expectedCases) process.exitCode = 1;
    }
}

if (!process.env.VITEST && process.argv[1]?.endsWith("probe-personal-selector.ts")) {
    main().catch(() => { console.error("Selector development probe failed; no raw provider error retained."); process.exitCode = 1; });
}
