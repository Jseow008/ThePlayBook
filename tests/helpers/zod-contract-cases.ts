import { z } from "zod";
import { ChecklistItemSchema, ContentQuerySchema } from "@/types/domain";
import { PersonalEvidenceScopeSchema } from "@/lib/personal-evidence";

export const zodContractCases = [
    { name: "scope/all", schema: PersonalEvidenceScopeSchema, input: { version: 1, itemType: "all" } },
    ...["123e4567-e89b-42d3-a456-426614174000", "11111111-1111-1111-1111-111111111111",
        "123e4567-e89b-92d3-a456-426614174000", "00000000-0000-0000-0000-000000000000",
        "ffffffff-ffff-ffff-ffff-ffffffffffff", "ABCDEFAB-CDEF-4ABC-ABCD-ABCDEFABCDEF", "malformed"].map((id, index) => ({
        name: `scope/id-${index}`, schema: PersonalEvidenceScopeSchema,
        input: { version: 1, itemType: "note", contentItemId: id },
    })),
    { name: "scope/unknown-type", schema: PersonalEvidenceScopeSchema, input: { version: 1, itemType: "invented" } },
    { name: "scope/unknown-property", schema: PersonalEvidenceScopeSchema, input: { version: 1, itemType: "all", extra: true } },
    { name: "scope/normalize-query", schema: PersonalEvidenceScopeSchema, input: { version: 1, itemType: "all", filterQuery: "  🌱  exact\nwords  " } },
    { name: "scope/query-limit", schema: PersonalEvidenceScopeSchema, input: { version: 1, itemType: "all", filterQuery: "x".repeat(161) } },
    ...[{}, { mandatory: false }, { mandatory: true }, { mandatory: "true" }, { extra: true }].map((value, index) => ({
        name: `checklist/${index}`, schema: ChecklistItemSchema, input: { id: "synthetic", label: "  Original 🌱 text  ", ...value },
    })),
    ...[{}, { limit: "42", offset: "3" }, { limit: "" }, { limit: "100" }, { limit: "101" },
        { offset: "-1" }, { offset: "NaN" }, { offset: "Infinity" }].map((input, index) => ({
        name: `query/${index}`, schema: ContentQuerySchema, input,
    })),
    ...[0, 1, -1, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1].map((input, index) => ({
        name: `counter/${index}`, schema: z.number().int().nonnegative(), input,
    })),
];

export function contractResult(schema: { safeParse: (input: unknown) => unknown }, input: unknown) {
    const result = schema.safeParse(input) as { success: boolean; data?: unknown; error?: { issues: Array<{ path: PropertyKey[] }> } };
    if (!result.success) return { accepted: false, paths: [...new Set(result.error!.issues.map(issue => issue.path.join(".")))].sort() };
    return { accepted: true, data: JSON.parse(JSON.stringify(result.data,
        (_, value) => typeof value === "number" && !Number.isFinite(value) ? `[${String(value)}]` : value)) as unknown };
}
