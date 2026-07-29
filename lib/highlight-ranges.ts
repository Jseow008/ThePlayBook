export interface HighlightRange {
    start: number;
    end: number;
}
export type HighlightRangeRelationship =
    | "distinct"
    | "exact"
    | "contained"
    | "contains"
    | "partial-overlap";

export function classifyHighlightRange(
    existing: HighlightRange,
    candidate: HighlightRange
): HighlightRangeRelationship {
    if (existing.start === candidate.start && existing.end === candidate.end) {
        return "exact";
    }

    if (existing.end <= candidate.start || candidate.end <= existing.start) {
        return "distinct";
    }

    if (existing.start <= candidate.start && existing.end >= candidate.end) {
        return "contained";
    }

    if (candidate.start <= existing.start && candidate.end >= existing.end) {
        return "contains";
    }

    return "partial-overlap";
}
