/** Offline provenance-checked conversion. Never makes provider calls or changes responses. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { buildPersonalEvidenceSelectionRequest, personalEvidenceSelectionRequestHash, PERSONAL_EVIDENCE_SELECTOR_LUNA_MODEL_CONFIG } from "../../lib/server/personal-evidence-selector";
import { readFrozenCorpus, readCapturedSelectorInputs, readDatabaseVectorFixture, validateRecordedProviderSelectionOutput, type ProviderSelectorRecord } from "../evaluate-personal-retrieval";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const arg = (name: string) => { const x = process.argv.find(x => x.startsWith("--" + name + "="))?.split("=").slice(1).join("="); if (!x) throw new Error(name + " required"); return x; };
const sourcePath = arg("source"), inputsPath = arg("inputs"), outputPath = arg("output");
const sourceRaw = readFileSync(sourcePath, "utf8"), source = JSON.parse(sourceRaw);
const corpus = readFrozenCorpus("v2");
const vectors = readDatabaseVectorFixture(corpus, "tests/fixtures/retrieval/provider-vectors-v2.json");
const capture = readCapturedSelectorInputs(corpus, inputsPath, vectors.sha256);
const modelConfig = PERSONAL_EVIDENCE_SELECTOR_LUNA_MODEL_CONFIG;
const config = { model: modelConfig.model, provider: modelConfig.provider, reasoningEffort: modelConfig.reasoningEffort,
    forceReasoning: modelConfig.forceReasoning, store: modelConfig.store, maxOutputTokens: modelConfig.maxOutputTokens, maxRetries: modelConfig.maxRetries };
const adapter = readFileSync("scripts/experiments/luna-final-phase.ts", "utf8");
const productionAdapter = readFileSync("lib/server/luna-final-phase.ts", "utf8");
if (adapter.slice(adapter.indexOf("import ")) !== productionAdapter.slice(productionAdapter.indexOf("import "))) throw new Error("Production adapter differs from evaluated adapter");
if (source.version !== "luna-final-phase-quality-v1" || !source.complete || source.failure
    || JSON.stringify(source.candidate) !== JSON.stringify(config)
    || source.adapterSha256 !== sha(adapter)
    || source.harnessSha256 !== sha(readFileSync("scripts/experiments/selector-luna-phase-quality.ts", "utf8"))
    || source.captureSha256 !== sha(readFileSync(inputsPath, "utf8"))
    || source.corpusSha256 !== capture.artifact.corpusSha256 || source.vectorSha256 !== vectors.sha256
    || source.runs !== 3 || source.totals.calls !== 168 || source.records.length !== 168) throw new Error("Evaluation provenance mismatch");
const seen = new Set<string>();
const records = (source.records as ProviderSelectorRecord[]).map(record => {
    const input = capture.artifact.records.find(x => x.caseId === record.caseId);
    const key = record.caseId + ":" + record.run;
    if (!input || seen.has(key) || ![1, 2, 3].includes(record.run) || record.outcome !== "complete"
        || record.model !== config.model || record.provider !== config.provider) throw new Error("Record mismatch");
    seen.add(key);
    const prepared = buildPersonalEvidenceSelectionRequest(JSON.parse(input.request.prompt));
    if (record.inputSha256 !== sha(JSON.stringify({ request: prepared.canonical, config }))) throw new Error("Evaluated request mismatch");
    validateRecordedProviderSelectionOutput(record, prepared.request);
    return { ...record, evaluatedInputSha256: record.inputSha256, inputSha256: personalEvidenceSelectionRequestHash(prepared.canonical, modelConfig) };
});
if (capture.artifact.records.some(input => [1, 2, 3].some(run => !seen.has(input.caseId + ":" + run)))) throw new Error("Missing case/run");
const converted = { version: "personal-retrieval-provider-selections-v2", corpusSha256: source.corpusSha256,
    vectorFixtureSha256: vectors.sha256, modelConfig, complete: true, sourceSha256: sha(sourceRaw),
    evaluatedAdapterSha256: source.adapterSha256, productionAdapterSha256: sha(productionAdapter),
    boundaries: ["Offline hash-format conversion only; every original request/config/output verified before rebinding.",
        "All 168 distinct provider responses retained; no retries, substitutions or new model calls."],
    revokedCaseIds: capture.artifact.revokedCaseIds, deterministicEmptyCaseIds: capture.artifact.deterministicEmptyCaseIds,
    records };
writeFileSync(outputPath, JSON.stringify(converted, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ records: records.length, sourceSha256: sha(sourceRaw), outputSha256: sha(readFileSync(outputPath, "utf8")) }));
