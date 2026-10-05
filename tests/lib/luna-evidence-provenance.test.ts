import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERSONAL_EVIDENCE_SELECTOR_LUNA_MODEL_CONFIG, buildPersonalEvidenceSelectionRequest, derivePersonalEvidenceSelectionIds, personalEvidenceSelectionRequestHash } from "@/lib/server/personal-evidence-selector";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const read = (p: string) => readFileSync(p, "utf8");
describe("Luna recorded decisions remain bound to evaluated requests and adapter", () => {
    it("preserves every qualified response and rejects unnoticed production/config drift", () => {
        const raw = read("docs/evidence/luna-low-quality-20261001.json");
        const evaluated = JSON.parse(raw);
        const fixture = JSON.parse(read("tests/fixtures/retrieval/provider-selections-v2-luna-low.json"));
        const baseline = JSON.parse(read("tests/fixtures/retrieval/provider-selections-v2-selector-v4.json"));
        const adapter = read("scripts/experiments/luna-final-phase.ts");
        const production = read("lib/server/luna-final-phase.ts");
        expect(evaluated.complete).toBe(true);
        expect(evaluated.failure).toBeNull();
        expect(evaluated.totals.calls).toBe(168);
        expect(fixture.sourceSha256).toBe(sha(raw));
        expect(fixture.modelConfig).toEqual(PERSONAL_EVIDENCE_SELECTOR_LUNA_MODEL_CONFIG);
        expect(evaluated.adapterSha256).toBe(sha(adapter));
        expect(adapter.slice(adapter.indexOf("import "))).toBe(production.slice(production.indexOf("import ")));
        expect(evaluated.harnessSha256).toBe(sha(read("scripts/experiments/selector-luna-phase-quality.ts")));
        expect(evaluated.baselineSha256).toBe(sha(read("tests/fixtures/retrieval/provider-selections-v2-selector-v4.json")));
        expect(fixture.records).toHaveLength(168);
        const seen = new Set<string>();
        for (const record of fixture.records) {
            const key = record.caseId + ":" + record.run;
            expect(seen.has(key)).toBe(false); seen.add(key);
            const original = evaluated.records.find((x: { caseId: string; run: number }) => x.caseId === record.caseId && x.run === record.run);
            const input = baseline.capturedInputs.find((x: { caseId: string }) => x.caseId === record.caseId);
            const prepared = buildPersonalEvidenceSelectionRequest(JSON.parse(input.request.prompt));
            expect(record.evaluatedInputSha256).toBe(sha(JSON.stringify({ request: prepared.canonical, config: evaluated.candidate })));
            expect(record.evaluatedInputSha256).toBe(original.inputSha256);
            expect(record.inputSha256).toBe(personalEvidenceSelectionRequestHash(prepared.canonical, fixture.modelConfig));
            expect(record.providerOutput).toEqual(original.providerOutput);
            expect(record.usage).toEqual(original.usage);
            expect(record.model).toBe(fixture.modelConfig.model);
            expect(record.provider).toBe(fixture.modelConfig.provider);
            expect(record.outcome).toBe("complete");
            expect(derivePersonalEvidenceSelectionIds(record.providerOutput, prepared.request)).toEqual(record.output.ids);
        }
        for (const input of baseline.capturedInputs) for (const run of [1, 2, 3]) expect(seen.has(input.caseId + ":" + run)).toBe(true);
    });
});
