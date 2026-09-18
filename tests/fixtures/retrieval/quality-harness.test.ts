import { getNotesAnthropicModelName, detectAskIntent, getAnthropicModelName, getOutputTokenCap, getNotesOutputTokenCap } from "../../../lib/server/retrieval-generation";
/** Structural harness tests. These never call a model or establish semantic quality. */
import { NoObjectGeneratedError } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    safeSelectorOutputFailure, validateRecordedProviderSelectionOutput, authorizedFixtureRows, fixtureExclusionPass, qualityScoreExitCode, createExecutionTokenCounter, fixtureSupportOutcomes, productionRetrievalHashes, databaseGenerationInputHash, readDatabaseGenerationInputs, databaseGenerationPlan, databaseVectorFixture, embeddingInputs, expandedEvidence, plan, readAcquisitionCheckpoint, readDatabaseVectorFixture, readFrozenCorpus,
    retrieveFixtureCase, safeProviderFailure, scopedRows, scoreQuality, QUALITY_CONFIG, ProviderScheduler,
    readCapturedSelectorInputs, capturedSelectorPlan, selectorOnlyMetrics, FROZEN_CORPUS_SHA256,
    type Adjudication, type FixtureCase, type FixtureEvidence, type Corpus, type QualityRecord, type VectorBank, type CapturedSelectorInputs,
} from "../../../scripts/evaluate-personal-retrieval";
import { selectPersonalEvidence, buildPersonalEvidenceSelectionRequest, personalEvidenceSelectionRequestHash, PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG }
    from "../../../lib/server/personal-evidence-selector";

const corpus = readFrozenCorpus();
const vector = (sign: number) => [sign, ...Array.from({ length: 767 }, () => 0)];
const mockBank = (input: Corpus): VectorBank => new Map(embeddingInputs(input).map((text) => [text, vector(-1)]));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const cleanup: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true }); });

function perfectStructuralRecords(): QualityRecord[] {
    return Array.from({ length: 3 }, (_, index) => corpus.cases.map((item): QualityRecord => {
        const exact = item.exactQuote !== null;
        const absent = item.requiredIds.length === 0;
        const text = exact ? item.exactQuote! : absent ? "No current evidence was found." : "Synthetic response for structural scoring only.";
        const modelCalled = !exact && !absent;
        return { caseId: item.id, run: index + 1, outcome: "complete", selectedIds: [...item.requiredIds],
            contextText: item.requiredIds.map((id) => { const row = corpus.evidence.find((e) => e.id === id)!; return row.text + (row.note ?? ""); }).join("\n"),
            responseText: text, branch: exact ? "exact_quote" : absent ? "no_evidence" : "model", modelCalled, evidenceTokenCount: 100,
            ...(modelCalled ? { modelResult: { text, finishReason: "stop", responseId: `mock-${item.id}-${index}`, modelId: "structural-mock",
                inputTokens: 200, outputTokens: 20, totalTokens: 220, promptCountEstimate: 200 } } : {}),
        };
    })).flat();
}
function reviewsFor(records: QualityRecord[]): Adjudication[] {
    return records.filter((item) => item.modelCalled).map((item) => ({ caseId: item.caseId, run: item.run,
        reviewer: "structural-test-not-human-quality-proof", responseSha256: hash(item.responseText!), abstained: false,
        grounded: true, noteAttributionCorrect: true }));
}

describe("provider-quality harness plan and provenance", () => {
    it("pins the unchanged 58-case corpus and has no provider calls in its plan", () => {
        const fetch = vi.fn(() => { throw new Error("Network prohibited in structural test"); });
        vi.stubGlobal("fetch", fetch);
        expect(plan(corpus)).toMatchObject({ cases: 58, records: 174, generationCallsUpperBound: 138, expandedRecords: 2090,
            uniqueEmbeddingInputs: 131, perClassRequiredCasesPerRun: { source_segment: 18, highlight: 18, reflection: 18 } });
        expect(fetch).not.toHaveBeenCalled();
        expect(QUALITY_CONFIG.threshold).toBe(0.55);
    });

    it("scopes by ownership/state/type and never by expected-evidence labels", () => {
        const rows = expandedEvidence(corpus);
        const scoped = scopedRows(rows, ["highlight"]);
        expect(scoped.length).toBeGreaterThan(1000);
        expect(scoped.every((row) => row.accountId === "account-a" && row.state === "available" && row.type === "highlight")).toBe(true);
        const requiredIds = new Set(corpus.cases.filter((item) => item.class === "highlight").flatMap((item) => item.requiredIds));
        expect(scoped.some((row) => !requiredIds.has(row.id))).toBe(true);
        // Forbidden vectors must exist in the bank even though these rows cannot enter the adapter scope.
        for (const row of corpus.evidence.filter((row) => row.state !== "available")) expect(embeddingInputs(corpus)).toContain(row.text);
    });

    it("exports reusable Float32 vectors with complete personal field and source/query mapping", () => {
        const bank = mockBank(corpus);
        const fixture = databaseVectorFixture(corpus, bank);
        expect(fixture.records).toHaveLength(2090);
        expect(fixture.queries).toHaveLength(58);
        const noted = fixture.records.find((row) => row.note)!;
        expect(noted.chunks.map((item) => item.field)).toContain("noteBody");
        const reflection = fixture.records.find((row) => row.type === "reflection" && row.prompt)!;
        expect(reflection.chunks.map((item) => item.field)).toEqual(expect.arrayContaining(["prompt", "reflectionText"]));
        const dir = mkdtempSync(join(tmpdir(), "retrieval-vector-structural-")); cleanup.push(dir);
        const path = join(dir, "vectors.json"); writeFileSync(path, JSON.stringify(fixture));
        const restored = readDatabaseVectorFixture(corpus, path);
        expect(restored.bank.size).toBe(131);
        expect(restored.bank.get(corpus.cases[0].query)).toEqual(vector(-1));
        expect(restored.sha256).toMatch(/^[0-9a-f]{64}$/);
        const first = Object.values(fixture.vectors)[0];
        const bytes = Buffer.from(first.float32leBase64, "base64"); bytes.writeFloatLE(Number.NaN, 0);
        first.float32leBase64 = bytes.toString("base64"); writeFileSync(path, JSON.stringify(fixture));
        expect(() => readDatabaseVectorFixture(corpus, path)).toThrow("INVALID_PROVIDER_VECTOR");
    });

    it("rejects changed vector model, missing/extra inputs, and altered input text", () => {
        const dir = mkdtempSync(join(tmpdir(), "retrieval-vector-invalid-")); cleanup.push(dir);
        const path = join(dir, "vectors.json");
        const fixture = databaseVectorFixture(corpus, mockBank(corpus));
        writeFileSync(path, JSON.stringify({ ...fixture, model: "different-model" }));
        expect(() => readDatabaseVectorFixture(corpus, path)).toThrow("VECTOR_FIXTURE_CONFIGURATION_MISMATCH");
        writeFileSync(path, JSON.stringify({ ...fixture, vectors: {} }));
        expect(() => readDatabaseVectorFixture(corpus, path)).toThrow("VECTOR_FIXTURE_INPUT_SET_MISMATCH");
        Object.values(fixture.vectors)[0].text = "an altered input"; writeFileSync(path, JSON.stringify(fixture));
        expect(() => readDatabaseVectorFixture(corpus, path)).toThrow("VECTOR_FIXTURE_INPUT_MISMATCH");
    });

    it("resumes only validated successful checkpoint vectors and preserves failed-attempt counters", () => {
        const dir = mkdtempSync(join(tmpdir(), "retrieval-checkpoint-")); cleanup.push(dir);
        const path = join(dir, "checkpoint.json");
        const texts = embeddingInputs(corpus).slice(0, 10);
        const checkpoint = { ...plan(corpus), embeddingResponses: [{ texts, vectors: texts.map(() => vector(1)), tokenCount: null, billableCharacters: null }],
            records: [], events: [{ kind: "google-embedding", attempt: 0, outcome: "success", durationMs: 100 },
                { kind: "google-embedding", attempt: 0, outcome: "PROVIDER_FAILURE", durationMs: 20 }],
            counters: { embeddingInputs: 20, embeddingInputBytes: 50_000, generationAttempts: 0, reservedGenerationTokens: 0 } };
        writeFileSync(path, JSON.stringify(checkpoint));
        const resumed = readAcquisitionCheckpoint(corpus, path);
        expect(resumed).toMatchObject({ reusedInputs: 10, missingInputs: 121, counters: { embeddingInputs: 20 } });
        expect(resumed.events).toHaveLength(2);
        checkpoint.embeddingResponses[0].texts[0] = "not in frozen synthetic inputs";
        writeFileSync(path, JSON.stringify(checkpoint));
        expect(() => readAcquisitionCheckpoint(corpus, path)).toThrow("ACQUISITION_CHECKPOINT_INPUT_INVALID");
    });
});

describe("production helper adapter with structural vectors only", () => {
    it("returns full stored exact text selected by vectors even when eligible labels name another record", async () => {
        const testCase = corpus.cases.find((item) => item.id === "highlight-risk")!;
        const target = corpus.evidence.find((item) => item.id === testCase.requiredIds[0])!;
        const small = { ...corpus, corpusExpansion: { ...corpus.corpusExpansion, noisePerPersonalClass: 0 } };
        const bank = mockBank(small); bank.set(testCase.query, vector(1));
        const exported = databaseVectorFixture(small, bank);
        for (const chunk of exported.records.find((item) => item.id === target.id)!.chunks) bank.set(exported.vectors[chunk.vectorKey].text, vector(1));
        const result = await retrieveFixtureCase(small, { ...testCase, requiredIds: [], eligibleIds: [], distractorIds: [target.id] }, bank);
        expect(result.branch).toBe("exact_quote");
        expect(result.deterministicText).toBe(target.text);
        expect(result.deterministicText!.length).toBeGreaterThan(220);
        expect(result.selectedIds).toEqual([target.id]);
        expect(result.system).toContain("A user's disagreement is their interpretation");
    });

    it("selects a source from actual bank cosine, not the fixture expected-ID list", async () => {
        const testCase = corpus.cases.find((item) => item.id === "source_segment-attention")!;
        const wrongSource = corpus.evidence.find((item) => item.type === "source_segment" && item.id !== testCase.requiredIds[0] && item.state === "available")!;
        const small = { ...corpus, corpusExpansion: { ...corpus.corpusExpansion, noisePerPersonalClass: 0 } };
        const bank = mockBank(small); bank.set(testCase.query, vector(1)); bank.set(wrongSource.text, vector(1));
        const result = await retrieveFixtureCase(small, testCase, bank);
        expect(result.selectedIds).toEqual([wrongSource.id]);
        expect(result.deterministicText).toBe(wrongSource.text);
    });
});

describe("fixed-denominator scoring", () => {
    it("does not grant a verdict without all three runs and independent review of each model output", () => {
        const records = perfectStructuralRecords();
        const pending = scoreQuality(corpus, records);
        expect(pending.numericalThresholdsPass).toBe(true);
        expect(pending.providerDiagnosticVerdict).toBe("INCOMPLETE");
        expect(pending.answerReview.pending.length).toBeGreaterThan(0);
        expect(pending.runs[0].perClass.highlight.total).toBe(18);
        expect(pending.runs[0].irrelevantRejection.total).toBe(58);
        expect(pending.runs[0].exactQuoteFidelity.total).toBe(12);
        expect(pending.releaseGate).toContain("NOT_ESTABLISHED");
        const missing = scoreQuality(corpus, records.slice(1), reviewsFor(records));
        expect(missing.complete).toBe(false);
        expect(missing.runs[0].perClass.source_segment.total).toBe(18);
        expect(missing.runs[0].perClass.source_segment.passed).toBe(17);
        expect(missing.numericalThresholdsPass).toBe(false);
    });

    it("counts mixed evidence for every class, rejects unrelated extras, and catches exact quote changes", () => {
        const records = perfectStructuralRecords();
        const mixed = records.find((item) => item.caseId === "mixed-attention" && item.run === 1)!;
        mixed.selectedIds = [];
        const quote = records.find((item) => item.caseId === "highlight-risk" && item.run === 1)!;
        quote.responseText = quote.responseText!.slice(0, 220);
        const extra = records.find((item) => item.caseId === "source_segment-learning" && item.run === 1)!;
        extra.selectedIds.push("noise-highlight-0");
        const score = scoreQuality(corpus, records, reviewsFor(records));
        for (const type of ["source_segment", "highlight", "reflection"] as const) expect(score.runs[0].perClass[type].passed).toBe(17);
        expect(score.runs[0].irrelevantRejection.passed).toBe(57);
        expect(score.runs[0].exactQuoteFidelity.passed).toBe(11);
        expect(score.numericalThresholdsPass).toBe(false);
    });

    it("binds adjudication to output bytes and cannot use a note's ID as proof that the note reached context", () => {
        const records = perfectStructuralRecords();
        const reviews = reviewsFor(records);
        const mixed = records.find((item) => item.caseId === "mixed-attention" && item.run === 1)!;
        mixed.contextText = "Only the source quote was sent; the user's disagreement was omitted.";
        const missingNote = scoreQuality(corpus, records, reviews);
        expect(missingNote.numericalThresholdsPass).toBe(true);
        expect(missingNote.conflictContext.find((item) => item.run === 1 && item.caseId === "mixed-attention")?.fullStoredNotePresent).toBe(false);
        expect(missingNote.providerDiagnosticVerdict).toBe("FAILED");
        mixed.responseText = "Changed output after review";
        expect(scoreQuality(corpus, records, reviews).providerDiagnosticVerdict).toBe("INCOMPLETE");
    });

    it("checks forbidden text even when excluded IDs are absent and refuses incomplete token proof", () => {
        const records = perfectStructuralRecords();
        records[0].responseText = corpus.evidence.find((item) => item.state === "unauthorized")!.text;
        records[1].evidenceTokenCount = null;
        const score = scoreQuality(corpus, records, reviewsFor(records));
        expect(score.runs[0].forbiddenEvidenceExclusion.passed).toBe(57);
        expect(score.tokenProofComplete).toBe(false);
        expect(score.providerDiagnosticVerdict).toBe("INCOMPLETE");
    });
});

describe("bounded provider failure handling", () => {
    it("allowlists status/retry delay without retaining raw error secrets", () => {
        const raw = { status: 429, secret: "never-save-me", message: JSON.stringify({ error: { message: "never-save-me", details: [
            { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "45.5s" },
        ] } }) };
        expect(safeProviderFailure(raw)).toEqual({ code: "PROVIDER_RATE_LIMIT", status: 429, retryAfterMs: 45_500 });
        expect(JSON.stringify(safeProviderFailure(raw))).not.toContain("never-save-me");
        expect(safeProviderFailure({ name: "TypeError", cause: { code: "ECONNRESET" }, message: "never-save-me" }))
            .toEqual({ code: "PROVIDER_FAILURE", status: undefined, errorName: "TypeError", transportCode: "ECONNRESET" });
        expect(safeProviderFailure({ message: '{"error":{"code":503,"message":"private"}}' })).toEqual({ code: "PROVIDER_FAILURE", status: 503 });
    });

    it("does not wait through an excessive provider retry delay or retry ambiguous failures", async () => {
        const scheduler = new ProviderScheduler();
        const action = vi.fn(async () => { throw { statusCode: 429, responseHeaders: { "retry-after": "120" } }; });
        await expect(scheduler.run("structural", action)).rejects.toMatchObject({ code: "PROVIDER_RETRY_DELAY_EXCEEDS_LIMIT" });
        expect(action).toHaveBeenCalledTimes(1);
        const ambiguous = new ProviderScheduler();
        const network = vi.fn(async () => { throw new Error("network result uncertain"); });
        await expect(ambiguous.run("structural", network)).rejects.toMatchObject({ code: "PROVIDER_FAILURE" });
        expect(network).toHaveBeenCalledTimes(1);
    });
});

describe("captured production selector protocol", () => {
    function captured(): CapturedSelectorInputs {
        const row = corpus.evidence.find((item) => item.type === "highlight" && item.state === "available")!;
        const id = `highlight:${row.id}`;
        return { version: "personal-retrieval-selection-inputs-v1", corpusSha256: FROZEN_CORPUS_SHA256,
            vectorFixtureSha256: "a".repeat(64), modelConfig: PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG,
            revokedCaseIds: corpus.cases.filter((item) => item.kind === "revoked").map((item) => item.id), deterministicEmptyCaseIds: [],
            records: corpus.cases.filter((item) => item.kind !== "revoked").map((item) => {
                const built = buildPersonalEvidenceSelectionRequest({ question: item.query, candidates: [{ id, type: "highlight", title: row.title,
                    fields: [{ name: "highlightedText", text: row.text }] }] });
                return { caseId: item.id, request: built.canonical, inputSha256: personalEvidenceSelectionRequestHash(built.canonical),
                    candidateFixtureIds: { [id]: row.id }, diagnosticOnlyAllCandidateIds: [id] };
            }) };
    }
    function saved(artifact: CapturedSelectorInputs) {
        const dir = mkdtempSync(join(tmpdir(), "selector-capture-")); cleanup.push(dir);
        const path = join(dir, "inputs.json"); writeFileSync(path, JSON.stringify(artifact)); return path;
    }
    it("validates exact production hashes and plans168 independent calls without provider requests", () => {
        const fetch = vi.fn(() => { throw new Error("Network prohibited in structural test"); }); vi.stubGlobal("fetch", fetch);
        const input = captured();
        const validated = readCapturedSelectorInputs(corpus, saved(input), input.vectorFixtureSha256);
        expect(capturedSelectorPlan(validated.artifact)).toMatchObject({ cases: 56, runs: 3, plannedGenerationCalls: 168, maximumCandidates: 1 });
        expect(fetch).not.toHaveBeenCalled();
        expect(() => readCapturedSelectorInputs(corpus, saved(input), "b".repeat(64))).toThrow("SELECTOR_CAPTURE_CONFIGURATION_MISMATCH");
    });
    it("accepts production unavailable-title only for a retained capture whose source is withdrawn", () => {
        const input = captured(); const fixture = structuredClone(corpus);
        for (const record of input.records) {
            const request = JSON.parse(record.request.prompt);
            request.candidates[0].title = "Source unavailable";
            record.request = buildPersonalEvidenceSelectionRequest(request).canonical;
            record.inputSha256 = personalEvidenceSelectionRequestHash(record.request);
        }
        expect(() => readCapturedSelectorInputs(fixture, saved(input))).toThrow("SELECTOR_CAPTURE_NON_SYNTHETIC_TITLE");
        const id = Object.values(input.records[0].candidateFixtureIds)[0];
        fixture.evidence.find((row) => row.id === id)!.lifecycle = { record: "present", source: "withdrawn" };
        expect(readCapturedSelectorInputs(fixture, saved(input)).artifact.records).toHaveLength(56);
    });
    it("rejects missing cases and stale request hashes instead of shrinking the benchmark", () => {
        const missing = captured(); missing.records.pop();
        expect(() => readCapturedSelectorInputs(corpus, saved(missing))).toThrow("SELECTOR_CAPTURE_INCOMPLETE");
        const stale = captured(); stale.records[0].inputSha256 = "0".repeat(64);
        expect(() => readCapturedSelectorInputs(corpus, saved(stale))).toThrow("SELECTOR_CAPTURE_HASH_MISMATCH");
    });
    it("does not send arbitrary private text even if an input has a valid regenerated production hash", () => {
        const input = captured(); const first = input.records[0];
        const parsed = JSON.parse(first.request.prompt);
        parsed.candidates[0].fields[0].text = "This unrelated private text is not in the synthetic fixture.";
        const altered = buildPersonalEvidenceSelectionRequest(parsed);
        first.request = altered.canonical; first.inputSha256 = personalEvidenceSelectionRequestHash(altered.canonical);
        expect(() => readCapturedSelectorInputs(corpus, saved(input))).toThrow("SELECTOR_CAPTURE_NON_SYNTHETIC_TEXT");
    });
    it("reports pre-composition selection metrics without claiming exact quote fidelity or a release pass", () => {
        const report = selectorOnlyMetrics(corpus, captured(), []);
        expect(report.runs[0].perClass.highlight).toEqual({ passed: 0, total: 18, rate: 0 });
        expect(report.runs[0].irrelevantRejectionAmongCapturedCases.total).toBe(56);
        expect(report.releaseGate).toContain("NOT_ASSESSED");
        expect(report.boundaries).toContain("not quote fidelity");
    });
});

describe("production database generation capture validation", () => {
    function captureFile() {
        const directory = mkdtempSync(join(tmpdir(), "production-generation-")); cleanup.push(directory);
        const path = join(directory, "capture.json");
        const records = Array.from({ length: QUALITY_CONFIG.runs }, (_, index) => corpus.cases.map((item) => {
            const revoked = item.kind === "revoked"; const library = item.scope.includes("source_segment");
            const record = { caseId: item.id, run: index + 1, outcome: "complete" as const, selectedIds: [], contextText: "", deniedRevokedSession: revoked,
                ...(!revoked ? { generationInput: { query: item.query, system: "Synthetic structural prompt; no model called.",
                    model: library ? getAnthropicModelName(detectAskIntent(item.query)) : getNotesAnthropicModelName(item.query),
                    maxOutputTokens: library ? getOutputTokenCap(detectAskIntent(item.query)) : getNotesOutputTokenCap(item.query),
                    branch: "no_evidence" as const, deterministicText: "No evidence." } } : {}) };
            return { ...record, generationInputSha256: databaseGenerationInputHash(record) };
        })).flat();
        const artifact = { version: "personal-retrieval-database-quality-v1", mode: "recorded-provider-selection-replay", corpusSha256: FROZEN_CORPUS_SHA256,
            productionHashes: productionRetrievalHashes(), vectorFixtureSha256: "a".repeat(64), selectionFixtureSha256: "b".repeat(64),
            expectedCases: records.length, executedCases: records.length, records };
        const save = () => writeFileSync(path, JSON.stringify(artifact)); save(); return { path, artifact, save };
    }
    it("has a network-free plan bound to complete production replay", () => {
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); const fixture = captureFile();
        const capture = readDatabaseGenerationInputs(corpus, fixture.path);
        expect(databaseGenerationPlan(corpus, capture)).toMatchObject({ records: 174, generationCallsUpperBound: 0 });
        expect(fetch).not.toHaveBeenCalled();
    });
    it("refuses candidate-only capture and changed implementation hashes", () => {
        const fixture = captureFile(); fixture.artifact.mode = "diagnostic-candidate-capture-not-a-quality-pass"; fixture.save();
        expect(() => readDatabaseGenerationInputs(corpus, fixture.path)).toThrow("DATABASE_GENERATION_CAPTURE_INVALID");
        fixture.artifact.mode = "recorded-provider-selection-replay"; fixture.artifact.productionHashes["app/api/chat/route.ts"] = "c".repeat(64); fixture.save();
        expect(() => readDatabaseGenerationInputs(corpus, fixture.path)).toThrow("DATABASE_GENERATION_IMPLEMENTATION_CHANGED");
    });
    it("rejects altered prompts even when rehashed if production model/cap differs", () => {
        const fixture = captureFile(); const record = fixture.artifact.records.find((item) => item.generationInput)!;
        record.generationInput!.maxOutputTokens += 1; record.generationInputSha256 = databaseGenerationInputHash(record); fixture.save();
        expect(() => readDatabaseGenerationInputs(corpus, fixture.path)).toThrow("DATABASE_GENERATION_PROMPT_INVALID");
    });
    it("rejects duplicate runs, missing hashes and revoked-session generation", () => {
        const fixture = captureFile(); fixture.artifact.records[1] = fixture.artifact.records[0]; fixture.save();
        expect(() => readDatabaseGenerationInputs(corpus, fixture.path)).toThrow("DATABASE_GENERATION_RECORD_INVALID");
        const second = captureFile(); second.artifact.records[0].generationInputSha256 = ""; second.save();
        expect(() => readDatabaseGenerationInputs(corpus, second.path)).toThrow("DATABASE_GENERATION_RECORD_INVALID");
        const third = captureFile(); const revoked = third.artifact.records.find((item) => item.deniedRevokedSession)!;
        revoked.deniedRevokedSession = false; revoked.generationInputSha256 = databaseGenerationInputHash(revoked); third.save();
        expect(() => readDatabaseGenerationInputs(corpus, third.path)).toThrow("DATABASE_GENERATION_REVOCATION_INVALID");
    });
    it("loads independently frozen v2 explicitly while preserving v1 default", () => {
        expect(readFrozenCorpus().version).toBe("personal-retrieval-v1");
        expect(readFrozenCorpus("v2").version).toBe("personal-retrieval-v2");
        expect(() => readFrozenCorpus("v3")).toThrow("UNKNOWN_CORPUS_VERSION");
    });
    it("accepts explicit independent AI assessment without calling it human", () => {
        const records = perfectStructuralRecords(); const reviews = reviewsFor(records);
        expect(scoreQuality(corpus, records, reviews, true).answerReview.reviewed).toBe(0);
        const independent = reviews.map((review) => ({ ...review, reviewerKind: "ai" as const, independent: true, answerComplete: true, rubricSha256: FROZEN_CORPUS_SHA256 }));
        const score = scoreQuality(corpus, records, independent, true);
        expect(score.answerReview.aiReviewed).toBe(reviews.length); expect(score.answerReview.humanReviewed).toBe(0);
        const incomplete = independent.map((review, index) => ({ ...review, answerComplete: index !== 0 }));
        expect(scoreQuality(corpus, records, incomplete, true).answerReview.allAnswerComplete).toBe(false);
        expect(scoreQuality(corpus, records, incomplete, true).providerDiagnosticVerdict).toBe("FAILED");
    });
});

 it("checks alternative facets without requiring absent alternatives or replacing ID recall", () => {
    const item = { ...corpus.cases[0], eligibleIds: ["a", "b"], acceptableEvidenceSets: [["a"], ["b"]],
        supportFacets: [{ id: "personal", description: "Either actual capture", anyOfIds: ["a", "b"], requiredFields: [
            { evidenceId: "a", field: "noteBody", contains: "note constraint" }, { evidenceId: "b", field: "reflectionText", contains: "reflection plan" }] }] };
    expect(fixtureSupportOutcomes(item, ["b"], "reflection plan")).toMatchObject({ allFacetsCovered: true, selectedFacetFieldsPresent: true, acceptableSetPresent: true });
    expect(fixtureSupportOutcomes(item, ["b"], "unrelated")).toMatchObject({ selectedFacetFieldsPresent: false });
    expect(fixtureSupportOutcomes(item, [], "reflection plan")).toMatchObject({ allFacetsCovered: false, acceptableSetPresent: false });
    expect(fixtureSupportOutcomes(item, ["b", "noise"], "reflection plan")).toMatchObject({ acceptableSetPresent: false });
});

it("caches only identical token-count requests within one execution and records provenance", async () => {
    const provider = vi.fn(async () => 17); const count = createExecutionTokenCounter(provider);
    const first = await count("model-a", "system", "question");
    const repeated = await count("model-a", "system", "question");
    expect(first.cacheHit).toBe(false); expect(repeated).toEqual({ ...first, cacheHit: true }); expect(provider).toHaveBeenCalledTimes(1);
    await count("model-b", "system", "question"); await count("model-a", "changed", "question"); await count("model-a", "system", "changed");
    expect(provider).toHaveBeenCalledTimes(4);
    await createExecutionTokenCounter(provider)("model-a", "system", "question"); expect(provider).toHaveBeenCalledTimes(5);
});

describe("quality CLI exit status", () => {
    it("returns zero only for complete passing quality evidence", () => {
        const records = perfectStructuralRecords();
        const review = reviewsFor(records).map((item) => ({ ...item, reviewerKind: "ai" as const,
            independent: true, answerComplete: true, rubricSha256: FROZEN_CORPUS_SHA256 }));
        const score = scoreQuality(corpus, records, review, true);
        expect(score.providerDiagnosticVerdict).toBe("THRESHOLDS_MET_IN_DIAGNOSTIC_ONLY");
        expect(qualityScoreExitCode(score)).toBe(0);
    });
    it("returns nonzero for failed thresholds without suppressing the score", () => {
        const records = perfectStructuralRecords(); records[0].selectedIds = [];
        records[0].responseText = "Wrong exact quote";
        const score = scoreQuality(corpus, records, reviewsFor(records));
        expect(score.providerDiagnosticVerdict).toBe("FAILED"); expect(qualityScoreExitCode(score)).toBe(1);
        expect(JSON.parse(JSON.stringify(score)).aggregate.exactQuoteFidelity).toBeLessThan(1);
    });
    it("returns nonzero for incomplete and invalid evidence", () => {
        const records = perfectStructuralRecords();
        expect(qualityScoreExitCode(scoreQuality(corpus, records.slice(1), reviewsFor(records)))).toBe(1);
        expect(qualityScoreExitCode(scoreQuality(corpus, records))).toBe(1);
        for (const value of [null, undefined, {}, { providerDiagnosticVerdict: "THRESHOLDS_MET_IN_DIAGNOSTIC_ONLY" }])
            expect(qualityScoreExitCode(value)).toBe(1);
    });
});

describe("v2 final-scoring authorization oracle", () => {
    function fixture() {
        const source: FixtureEvidence = { ...readFrozenCorpus("v2").evidence.find((row) => row.type === "source_segment")!, id: "source", contentId: "content-a", segmentId: "segment-a", title: "Current source title", text: "Stored shared passage.", state: "available", lifecycle: { record: "present" as const, source: "available" as const } };
        const highlight = { ...source, id: "highlight", type: "highlight" as const, note: null, prompt: null };
        const note = { ...highlight, id: "note", text: "Different selected words.", note: "A private qualifying note." };
        const reflection = { ...highlight, id: "reflection", type: "reflection" as const, segmentId: null, text: "Actual reflected answer.", prompt: "Question prompt" };
        const input: Corpus = { ...readFrozenCorpus("v2"), evidence: [source, highlight, note, reflection], corpusExpansion: { ...corpus.corpusExpansion, noisePerPersonalClass: 0 } };
        const testCase = { ...input.cases[0], request: { surface: "notes" as const, accountId: "account-a" as const, sessionState: "valid" as const, notesScope: { version: 1 as const, itemType: "all" as const } } };
        return { input, testCase, source, highlight, note, reflection };
    }
    it("enforces actual Notes item type, color, content and literal filter constraints", () => {
        const { input, testCase } = fixture();
        const selected = (scope: NonNullable<FixtureCase["request"]>["notesScope"]) => authorizedFixtureRows(input, { ...testCase, request: { ...testCase.request, notesScope: scope } }).map((row) => row.id);
        expect(selected({ version: 1, itemType: "all" })).toEqual(["highlight", "note", "reflection"]);
        expect(selected({ version: 1, itemType: "highlight" })).toEqual(["highlight"]);
        expect(selected({ version: 1, itemType: "note" })).toEqual(["note"]);
        expect(selected({ version: 1, itemType: "reflection" })).toEqual(["reflection"]);
        expect(selected({ version: 1, itemType: "all", color: "yellow" })).toEqual(["highlight", "note"]);
        expect(selected({ version: 1, itemType: "all", color: "blue" })).toEqual([]);
        expect(selected({ version: 1, itemType: "all", contentItemId: "other-content" })).toEqual([]);
        expect(selected({ version: 1, itemType: "all", filterQuery: "  PRIVATE   qualifying " })).toEqual(["note"]);
        expect(selected({ version: 1, itemType: "all", filterQuery: "%" })).toEqual([]);
    });
    it("retains owned capture wording after source withdrawal without allowing the source ID", () => {
        const { input, testCase, source } = fixture(); source.lifecycle = { record: "present", source: "withdrawn" };
        const library: FixtureCase = { ...testCase, request: { ...testCase.request, surface: "library", notesScope: null } };
        expect(fixtureExclusionPass(input, library, { selectedIds: ["highlight"], contextText: "Stored shared passage.", responseText: "Stored shared passage." })).toBe(true);
        expect(fixtureExclusionPass(input, library, { selectedIds: ["source"], contextText: "Stored shared passage.", responseText: null })).toBe(false);
        expect(authorizedFixtureRows(input, { ...testCase, request: { ...testCase.request, notesScope: { version: 1, itemType: "all", filterQuery: "Current source title" } } })).toEqual([]);
    });
    it("rejects revoked requests, deleted/other-account IDs and unique forbidden field text", () => {
        const { input, testCase, note, reflection } = fixture();
        note.lifecycle = { record: "user_deleted", source: "available" }; reflection.accountId = "account-b";
        expect(authorizedFixtureRows(input, testCase).map((row) => row.id)).toEqual(["highlight"]);
        expect(fixtureExclusionPass(input, testCase, { selectedIds: ["highlight"], contextText: "A private qualifying note.", responseText: null })).toBe(false);
        expect(fixtureExclusionPass(input, testCase, { selectedIds: ["reflection"], contextText: "", responseText: null })).toBe(false);
        expect(authorizedFixtureRows(input, { ...testCase, request: { ...testCase.request, sessionState: "revoked" } })).toEqual([]);
        expect(fixtureExclusionPass(input, { ...testCase, request: { ...testCase.request, notesScope: { version: 1, itemType: "note" } } }, { selectedIds: ["highlight"], contextText: "", responseText: null })).toBe(false);
    });
});

describe("v4 recorded selector judgments", () => {
    const candidates = ["a", "b"].map((id) => ({ id, type: "highlight" as const, title: "Neutral entry", fields: [{ name: "highlightedText" as const, text: `Stored field ${id}` }] }));
    const question = "Which stored field establishes the requested fact?";
    const assessment = (id: string, verdict: "direct" | "adjacent") => ({ id, requestedFacet: "requested fact", supportSummary: "Synthetic structural assessment", constraintCheck: "Synthetic identity check", verdict });
    it("replays the exact structured judgments and derives only direct IDs through production code", async () => {
        const providerOutput = { requestedFacets: ["requested fact"], assessments: [assessment("b", "adjacent"), assessment("a", "direct")] };
        const request = buildPersonalEvidenceSelectionRequest({ question, candidates }).request;
        const validated = validateRecordedProviderSelectionOutput({ output: { ids: ["a"] }, providerOutput }, request);
        expect(validated).toBe(providerOutput);
        const result = await selectPersonalEvidence({ question, candidates, generate: async () => ({ output: validated }) });
        expect(result.ids).toEqual(["a"]);
        expect(providerOutput.assessments).toHaveLength(2);
    });
    it("rejects legacy IDs-only fixtures and derived IDs that disagree with judgments", () => {
        const request = buildPersonalEvidenceSelectionRequest({ question, candidates }).request;
        expect(() => validateRecordedProviderSelectionOutput({ output: { ids: ["a"] } }, request)).toThrow("SELECTOR_RAW_OUTPUT_REQUIRED");
        expect(() => validateRecordedProviderSelectionOutput({ output: { ids: ["a"] }, providerOutput: { requestedFacets: ["requested fact"], assessments: [assessment("a", "adjacent")] } }, request)).toThrow("SELECTOR_DERIVED_IDS_MISMATCH");
        expect(() => validateRecordedProviderSelectionOutput({ output: { ids: [] }, providerOutput: { requestedFacets: ["requested fact"], assessments: [assessment("unknown", "direct")] } }, request)).toThrow();
    });
    it("hash-binds the complete canonical schema and output budget", () => {
        const prepared = buildPersonalEvidenceSelectionRequest({ question, candidates });
        const hash = personalEvidenceSelectionRequestHash(prepared.canonical);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        expect(prepared.canonical.maxOutputTokens).toBe(1600);
        Object.assign(prepared.canonical.outputSchema, { unexpectedWeakenedSchema: true });
        expect(() => personalEvidenceSelectionRequestHash(prepared.canonical)).toThrow();
    });
});

describe("safe paid selector failure evidence", () => {
    function errorWith(text: string) {
        return new NoObjectGeneratedError({ text, message: "private provider message must not be persisted", cause: new Error("private cause"),
            response: { id: "msg_synthetic", modelId: "synthetic-model", timestamp: new Date(0), headers: { authorization: "never-persist-secret" } },
            usage: { inputTokens: 123, outputTokens: 45, totalTokens: 168,
                inputTokenDetails: { noCacheTokens: 123, cacheReadTokens: 0, cacheWriteTokens: 0 }, outputTokenDetails: { textTokens: 45, reasoningTokens: 0 } }, finishReason: "length" });
    }
    it("retains synthetic model output and paid usage without error metadata or credentials", () => {
        const text = '{"requestedFacets":["Synthetic facet"],"assessments":[]}';
        const result = safeSelectorOutputFailure(errorWith(text));
        expect(result).toMatchObject({ text, output: { requestedFacets: ["Synthetic facet"], assessments: [] }, usage: { inputTokens: 123, outputTokens: 45, totalTokens: 168 }, rawTextTruncated: false });
        expect(result?.rawTextSha256).toBe(hash(text));
        expect(JSON.stringify(result)).not.toMatch(/never-persist-secret|private provider|private cause|authorization/);
        expect(safeSelectorOutputFailure(new Error("private ordinary failure"))).toBeUndefined();
    });
    it("bounds raw text while retaining original hash/length and never invents a parsed output", () => {
        const text = "x".repeat(300_000); const result = safeSelectorOutputFailure(errorWith(text))!;
        expect(Buffer.byteLength(result.text)).toBe(256 * 1024);
        expect(result).toMatchObject({ output: null, rawTextTruncated: true, rawTextBytes: 300_000, rawTextSha256: hash(text) });
        expect(Buffer.byteLength(safeSelectorOutputFailure(errorWith("界".repeat(100_000)))!.text)).toBeLessThanOrEqual(256 * 1024);
    });
    it("does not retry a rate-limited selector acquisition", async () => {
        const action = vi.fn(async () => { throw { statusCode: 429 }; });
        await expect(new ProviderScheduler(0).run("anthropic-selector", action)).rejects.toMatchObject({ status: 429 });
        expect(action).toHaveBeenCalledTimes(1);
    });
});
