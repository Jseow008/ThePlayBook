/** Structural test double only; these judgments are not provider-quality evidence. */
export function structuralSelectionOutput(ids: readonly string[]) {
    return {
        requestedFacets: ["The fixture's requested evidence"],
        assessments: ids.map((id) => ({
            id,
            requestedFacet: "The fixture's requested evidence",
            supportSummary: "The test supplies this authorized candidate as direct support.",
            constraintCheck: "Constraints are supplied by the structural fixture, not a model evaluation.",
            verdict: "direct" as const,
        })),
    };
}

/** Provider wire test double; never evidence of model quality. */
export function structuralSlotOutput(ids: readonly string[], slots = 8) {
    const logical = structuralSelectionOutput(ids);
    return { ...logical, assessments: Object.fromEntries(Array.from({ length: Math.max(slots, ids.length) }, (_, i) => [`slot${i + 1}`, logical.assessments[i] ?? null])) };
}
