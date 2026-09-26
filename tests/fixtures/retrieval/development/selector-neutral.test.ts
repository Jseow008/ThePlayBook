import { structuralSelectionOutput } from "@/tests/fixtures/retrieval/selection-output";
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareSelectorDevelopmentArtifact, readSelectorDevelopmentFixture, runSelectorDevelopmentProbe, selectorDevelopmentModelConfig } from "../../../../scripts/probe-personal-selector";
import type { PersonalEvidenceSelectionGenerator } from "@/lib/server/personal-evidence-selector";

const fixture = readSelectorDevelopmentFixture();
describe("neutral-title selector development harness (structural proof only)", () => {
    it("has six distinct challenges without answer labels in titles or IDs", () => {
        expect(new Set(fixture.cases.map(item => item.id)).size).toBe(6);
        for (const testCase of fixture.cases) {
            for (const candidate of testCase.candidates) {
                expect(candidate.id).toMatch(/^c\d{2}$/);
                expect(candidate.title).toMatch(/^(Notebook|Journal|Reading) \d{2}$/);
            }
            expect(testCase.expectedIds.every(id => testCase.candidates.some(candidate => candidate.id === id))).toBe(true);
        }
        expect(fixture.cases.find(item => item.id === "exact-passage-target")!.candidates[1].fields[0].text.length).toBeGreaterThan(220);
    });
    it("runs the actual selector and retains measured usage/output without exposing expected IDs in its prompt", async () => {
        let index = 0;
        const generate = vi.fn<PersonalEvidenceSelectionGenerator>(async request => {
            const testCase = fixture.cases[index++];
            const prompt = JSON.parse(request.prompt);
            expect(prompt).not.toHaveProperty("expectedIds");
            expect(prompt).not.toHaveProperty("caseId");
            expect(prompt.candidates).toEqual(testCase.candidates);
            return { output: structuralSelectionOutput(testCase.expectedIds), usage: { inputTokens: 200, outputTokens: 12, totalTokens: 212 }, model: "structural-mock", provider: "injected" };
        });
        const result = await runSelectorDevelopmentProbe({ generate });
        expect(generate).toHaveBeenCalledTimes(6);
        expect(result.passedCases).toBe(6);
        expect(result.evidenceKind).toContain("structural proof only");
        expect(result.records[0]).toMatchObject({ rawSyntheticOutput: structuralSelectionOutput(["c02"]), usage: { totalTokens: 212 } });
        expect(result.pricing.estimatedUsd).toBeNull();
        expect(result.records[0].inputSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(result.records[0].systemPromptSha256).toMatch(/^[0-9a-f]{64}$/);
    });
    it("does not manufacture a pass when a valid but irrelevant ID is selected", async () => {
        const result = await runSelectorDevelopmentProbe({ cases: [fixture.cases[0]], generate: async () => ({ output: structuralSelectionOutput(["c01"]) }) });
        expect(result.records[0]).toMatchObject({ outcome: "complete", passed: false, selectedIds: ["c01"] });
    });
    it("binds the explicit diagnostic model to the request hash without changing its prompt or fixture", async () => {
        const generate: PersonalEvidenceSelectionGenerator = async () => ({ output: structuralSelectionOutput([]) });
        const baseline = await runSelectorDevelopmentProbe({ cases: [fixture.cases[0]], generate });
        const comparison = await runSelectorDevelopmentProbe({ cases: [fixture.cases[0]], generate, model: "claude-sonnet-4-6" });
        expect(comparison.modelConfig.model).toBe("claude-sonnet-4-6");
        expect(comparison.modelOverride).toBe(true);
        expect(comparison.fixtureSha256).toBe(baseline.fixtureSha256);
        expect(comparison.records[0].systemPromptSha256).toBe(baseline.records[0].systemPromptSha256);
        expect(comparison.records[0].inputSha256).not.toBe(baseline.records[0].inputSha256);
        expect(selectorDevelopmentModelConfig().model).toBe("claude-haiku-4-5-20251001");
        expect(() => selectorDevelopmentModelConfig("unapproved-model")).toThrow();
    });
    it("stops after a rejected or unavailable provider response and retains the failure denominator", async () => {
        const generate = vi.fn<PersonalEvidenceSelectionGenerator>(async () => ({ output: structuralSelectionOutput(["invented-id"]) }));
        const result = await runSelectorDevelopmentProbe({ generate });
        expect(generate).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ expectedCases: 6, completedCases: 1, passedCases: 0 });
        expect(result.records[0]).toMatchObject({ error: "INVALID_SELECTION", rawSyntheticOutput: structuralSelectionOutput(["invented-id"]) });
    });
    it("accepts only the two independent development fixtures and preserves multi-facet and abstention cases", () => {
        const precision = readSelectorDevelopmentFixture("selector-precision-v1.json");
        expect(precision.cases).toHaveLength(6);
        expect(precision.cases.filter(item => item.expectedIds.length === 0)).toHaveLength(2);
        expect(precision.cases.some(item => item.expectedIds.length === 3)).toBe(true);
        for (const item of precision.cases) for (const candidate of item.candidates) {
            expect(candidate.id).toMatch(/^p\d{2}$/);
            expect(candidate.title).toMatch(/^(Notebook|Journal|Reading) \d{2}$/);
        }
        expect(() => readSelectorDevelopmentFixture("../corpus-v2.json")).toThrow("Only the named synthetic development fixtures");
    });
    it("preflights the artifact and checkpoints each completed response before another provider call", async () => {
        const directory = mkdtempSync(join(tmpdir(), "netflux-selector-probe-"));
        try {
            const destination = join(directory, "report.json");
            const progress = prepareSelectorDevelopmentArtifact(destination, { outcome: "incomplete" });
            expect(() => prepareSelectorDevelopmentArtifact(destination, {})).toThrow();
            expect(() => prepareSelectorDevelopmentArtifact(join(directory, "missing", "report.json"), {})).toThrow();
            let call = 0;
            const generate = vi.fn<PersonalEvidenceSelectionGenerator>(async () => {
                expect(JSON.parse(readFileSync(destination, "utf8")).records).toHaveLength(call);
                return { output: structuralSelectionOutput(fixture.cases[call++].expectedIds), usage: { inputTokens: 100, outputTokens: 8, totalTokens: 108 } };
            });
            const result = await runSelectorDevelopmentProbe({ cases: fixture.cases.slice(0, 2), generate, onProgress: progress });
            expect(result.actualCalls).toBe(2);
            expect(JSON.parse(readFileSync(destination, "utf8")).records).toEqual(result.records);
        } finally { rmSync(directory, { recursive: true, force: true }); }
    });
});
