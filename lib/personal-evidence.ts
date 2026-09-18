import { z } from "zod";

/** Filters describe the whole requested collection, independently of the AI question. */
export const PersonalEvidenceScopeSchema = z.object({
    version: z.literal(1),
    itemType: z.enum(["all", "highlight", "note", "reflection"]),
    contentItemId: z.string().uuid().optional(),
    color: z.enum(["yellow", "blue", "green", "pink", "purple", "red"]).optional(),
    filterQuery: z.string().trim().max(160).transform((value) => value.replace(/\s+/g, " ")).optional(),
}).strict();

export type PersonalEvidenceScope = z.infer<typeof PersonalEvidenceScopeSchema>;

export type PersonalEvidenceSource = {
    id: string;
    title: string;
    author: string | null;
    updatedAt: string;
};

type PersonalEvidenceBase = {
    evidenceId: string;
    id: string;
    userId: string;
    contentItemId: string;
    createdAt: string | null;
    updatedAt: string | null;
    /** Hash of actual evidence and eligible source context, not a client timestamp. */
    fingerprint: string;
    sourceStatus: "available" | "unavailable";
    source: PersonalEvidenceSource | null;
};

export type HighlightEvidenceCandidate = PersonalEvidenceBase & {
    type: "highlight";
    highlightedText: string;
    noteBody: string | null;
    color: string | null;
    segmentId: string | null;
    anchorStart: number | null;
    anchorEnd: number | null;
    segment: {
        id: string;
        contentItemId: string;
        title: string | null;
        updatedAt: string;
        fingerprint: string;
    } | null;
    /** Eligible source anchor; raw stored anchors above remain personal context. */
    readerAnchor: { start: number; end: number } | null;
};

export type ReflectionEvidenceCandidate = PersonalEvidenceBase & {
    type: "reflection";
    prompt: string;
    reflectionText: string;
};

export type PersonalEvidenceCandidate = HighlightEvidenceCandidate | ReflectionEvidenceCandidate;
