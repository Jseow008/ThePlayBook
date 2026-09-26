/** DEVELOPMENT OFFLINE ONLY. Raw prior responses can be revalidated; no model call or production change. */
import { z } from "zod";
export const RELAXED_ASSESSMENT_SCHEMA_VERSION = "selector-reasoned-assessment-schema-v2";
export const RELAXED_ASSESSMENT_SCHEMA_LIMITS = Object.freeze({ internalStringCharacters: 2_000, requestedFacets: 8, assessments: 8 });
const internalText = z.string().min(1).max(RELAXED_ASSESSMENT_SCHEMA_LIMITS.internalStringCharacters).refine(value => Boolean(value.trim()));
export function buildRelaxedAssessmentSchema(allowedIds: readonly string[], maximumAssessments = 8) {
    if (!allowedIds.length || new Set(allowedIds).size !== allowedIds.length || !Number.isInteger(maximumAssessments)
        || maximumAssessments < 1 || maximumAssessments > 8) throw new Error("INVALID_INPUT");
    return z.object({ requestedFacets: z.array(internalText).min(1).max(8),
        assessments: z.array(z.object({ id: z.enum([...allowedIds] as [string, ...string[]]), requestedFacet: internalText,
            supportSummary: internalText, constraintCheck: internalText,
            verdict: z.enum(["direct", "adjacent", "not_established", "contradicts_requested_claim"]),
        }).strict()).max(maximumAssessments),
    }).strict();
}
export function validateRelaxedAssessmentOutput(allowedIds: readonly string[], output: unknown, maximumAssessments = 8) {
    const parsed = buildRelaxedAssessmentSchema(allowedIds, maximumAssessments).safeParse(output);
    if (!parsed.success) return { valid: false as const, code: "INVALID_SCHEMA", issues: parsed.error.issues.map(issue => ({ path: issue.path, code: issue.code })), ids: null };
    const ids = parsed.data.assessments.map(item => item.id);
    if (new Set(ids).size !== ids.length) return { valid: false as const, code: "DUPLICATE_ID", issues: [], ids: null };
    return { valid: true as const, ids: parsed.data.assessments.filter(item => item.verdict === "direct").map(item => item.id), output: parsed.data };
}
