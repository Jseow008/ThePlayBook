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
