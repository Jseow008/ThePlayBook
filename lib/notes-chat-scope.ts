import { PersonalEvidenceScopeSchema, type PersonalEvidenceScope } from '@/lib/personal-evidence';

export interface NotesChatScopePayload {
    scope: PersonalEvidenceScope | null;
    invalidReason?: string;
    summary: string;
    signature: string;
}

export function createNotesChatScope(input: unknown, summary?: string): NotesChatScopePayload {
    const normalized = input && typeof input === 'object' && 'filterQuery' in input && typeof input.filterQuery === 'string'
        ? { ...input, filterQuery: input.filterQuery.trim().replace(/\s+/g, ' ') } : input;
    const result = PersonalEvidenceScopeSchema.safeParse(normalized);
    if (!result.success) return {
        scope: null,
        summary: "Invalid Notes filters",
        signature: JSON.stringify({ invalidScope: input }),
        invalidReason: "Adjust your filters before asking. Search text must be at most 160 characters and the selected source must be valid.",
    };
    const parsed = result.data;
    const scope: PersonalEvidenceScope = {
        version: 1,
        itemType: parsed.itemType,
        ...(parsed.contentItemId ? { contentItemId: parsed.contentItemId } : {}),
        ...(parsed.color ? { color: parsed.color } : {}),
        ...(parsed.filterQuery?.trim() ? { filterQuery: parsed.filterQuery.trim() } : {}),
    };
    return {
        scope,
        summary: (summary || (scope.itemType === 'all' ? 'All saved highlights, notes, and reflections' : `${scope.itemType === 'note' ? 'Written notes' : scope.itemType === 'reflection' ? 'Reflections' : 'Highlights'} matching your filters`)).slice(0, 300),
        signature: JSON.stringify(scope),
    };
}

export function serializeNotesChatScope(scope: NotesChatScopePayload): string {
    const normalized = createNotesChatScope(scope.scope, scope.summary);
    return JSON.stringify({ scope: normalized.scope, summary: normalized.summary });
}

export function parseNotesChatScope(value?: string): NotesChatScopePayload | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        const scope = PersonalEvidenceScopeSchema.safeParse(parsed.scope);
        if (!scope.success || typeof parsed.summary !== 'string' || parsed.summary.length > 300) return null;
        return createNotesChatScope(scope.data, parsed.summary);
    } catch {
        return null;
    }
}
