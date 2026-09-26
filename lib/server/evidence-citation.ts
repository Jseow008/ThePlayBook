import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { CitationLink, CitationResolution } from "@/lib/evidence-citation";
import type { RankedPersonalEvidence } from "@/lib/server/personal-evidence-ranking";
import type { LibrarySourceEvidence } from "@/lib/server/library-evidence";
import { loadSelectedPersonalEvidence, PersonalEvidenceRetrievalError } from "@/lib/server/personal-evidence-candidates";

const PURPOSE = "netflux:evidence-citation:v1";
const MAX_TOKEN = 23_000;
const SpanSchema = z.object({
    field: z.enum(["highlightedText", "noteBody", "reflectionText", "source"]),
    start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1).max(4_000),
}).refine((span) => span.end > span.start);
const ReferenceSchema = z.object({
    version: z.literal(1), responseId: z.string().uuid(), userId: z.string().uuid(),
    expiresAt: z.number().int(), type: z.enum(["highlight", "reflection", "source_segment"]),
    id: z.string().uuid(), contentItemId: z.string().uuid(), fingerprint: z.string().min(1).max(128),
    spans: z.array(SpanSchema).min(1).max(8),
});
type Reference = z.infer<typeof ReferenceSchema>;
const labels = { highlightedText: "Your highlight", noteBody: "Your note", reflectionText: "Your reflection", source: "Editorial passage" };
function key() {
    const secret = process.env.ACCOUNT_DATA_CURSOR_SECRET;
    if (!secret || secret.length < 32) throw new Error("Citation key is not configured");
    return createHmac("sha256", secret).update(PURPOSE).digest();
}
function seal(reference: Reference) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(), iv);
    cipher.setAAD(Buffer.from(PURPOSE));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(ReferenceSchema.parse(reference)), "utf8"), cipher.final()]);
    const token = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
    if (token.length > MAX_TOKEN) throw new Error("Citation exceeds the reference limit");
    return token;
}
function open(token: string, userId: string): Reference | null {
    const secretKey = key(); // Missing configuration is an operational failure, not missing evidence.
    try {
        if (token.length > MAX_TOKEN || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
        const bytes = Buffer.from(token, "base64url");
        if (bytes.length < 29 || bytes.toString("base64url") !== token) return null;
        const cipher = createDecipheriv("aes-256-gcm", secretKey, bytes.subarray(0, 12));
        cipher.setAAD(Buffer.from(PURPOSE));
        cipher.setAuthTag(bytes.subarray(12, 28));
        const value = ReferenceSchema.parse(JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8")));
        return value.userId === userId && value.expiresAt > Date.now() ? value : null;
    } catch { return null; }
}

/** No issuance endpoint: only the final authorized response selection may mint references. */
export function issueEvidenceCitations(options: {
    userId: string; personal: readonly RankedPersonalEvidence[]; sources?: readonly LibrarySourceEvidence[];
    evidenceIds?: readonly string[]; exactQuote?: boolean;
}): CitationLink[] {
    const sources = options.sources ?? [];
    const ids = options.evidenceIds ?? options.personal.map((item) => item.evidence.evidenceId);
    if (ids.length > 8 || new Set(ids).size !== ids.length) throw new Error("Invalid citation selection");
    const responseId = randomUUID();
    return ids.map((id) => {
        const personals = options.personal.filter((item) => item.evidence.evidenceId === id);
        const editorials = sources.filter((item) => item.evidenceId === id);
        if (personals.length + editorials.length !== 1) throw new Error("Citation outside selected evidence");
        const personal = personals[0];
        const source = editorials[0];
        const record = personal?.evidence;
        if (record && record.userId !== options.userId) throw new Error("Citation owner mismatch");
        const spans: Reference["spans"] = personal ? personal.spans.filter((span) => span.field !== "prompt").map((span) => {
            const full = record!.type === "highlight"
                ? span.field === "highlightedText" ? record!.highlightedText : span.field === "noteBody" ? record!.noteBody : null
                : span.field === "reflectionText" ? record!.reflectionText : null;
            if (full == null || full.slice(span.start, span.end) !== span.text || span.start < 0 || span.end > full.length) throw new Error("Invalid citation span");
            return { field: span.field as Reference["spans"][number]["field"], start: span.start, end: span.end, text: span.text };
        }) : (() => {
            const span = options.exactQuote ? { start: 0, end: source.text.length, text: source.text } : source.span;
            if (!span || source.text.slice(span.start, span.end) !== span.text || span.start < 0 || span.end > source.text.length) throw new Error("Invalid source citation span");
            return [{ field: "source" as const, start: span.start, end: span.end, text: span.text }];
        })();
        const title = record ? record.source?.title ?? "Saved evidence" : source.title;
        const token = seal({ version: 1, responseId, userId: options.userId, expiresAt: Date.now() + 86_400_000,
            type: record?.type ?? "source_segment", id: record?.id ?? source.id,
            contentItemId: record?.contentItemId ?? source.contentItemId, fingerprint: record?.fingerprint ?? source.fingerprint, spans });
        return { label: `${record ? record.type === "reflection" ? "Reflection" : "Highlight / note" : "Editorial passage"}: ${title}`.slice(0, 400), href: `/evidence#${token}` };
    });
}

function passages(reference: Reference, fields?: Partial<Record<Reference["spans"][number]["field"], string>>) {
    return reference.spans.map((span) => {
        const full = fields?.[span.field];
        if (full !== undefined && full.slice(span.start, span.end) !== span.text) throw new Error("Citation span no longer matches");
        return { label: labels[span.field], text: span.text,
            before: full === undefined ? "" : full.slice(Math.max(0, span.start - 400), span.start),
            after: full === undefined ? "" : full.slice(span.end, span.end + 400) };
    });
}

/** Ordinary authenticated RLS client only. The encrypted reference never grants access. */
export async function resolveEvidenceCitation(options: {
    token: string; userId: string; supabase: Pick<SupabaseClient<Database>, "from">; signal: AbortSignal;
}): Promise<CitationResolution> {
    const reference = open(options.token, options.userId);
    if (!reference) return { state: "unavailable" };
    const { supabase, signal } = options;
    signal.throwIfAborted();
    if (reference.type !== "source_segment") {
        let current;
        try {
            [current] = await loadSelectedPersonalEvidence({ supabase, userId: options.userId,
                scope: { version: 1, itemType: "all" }, selected: [{ type: reference.type, id: reference.id }], signal });
        } catch (error) {
            if (error instanceof PersonalEvidenceRetrievalError && error.code === "STALE_EVIDENCE") return { state: "unavailable" };
            throw error;
        }
        if (!current || current.contentItemId !== reference.contentItemId) return { state: "unavailable" };
        const fields = current.type === "highlight" ? { highlightedText: current.highlightedText, noteBody: current.noteBody ?? "" } : { reflectionText: current.reflectionText };
        // Clearing a field is deletion, even if its parent highlight survives.
        if (reference.spans.some((span) => !fields[span.field as keyof typeof fields])) return { state: "unavailable" };
        const available = current.sourceStatus === "available";
        const changed = current.fingerprint !== reference.fingerprint;
        return { state: !available ? "withdrawn" : changed ? "changed" : "available", kind: current.type,
            title: available ? current.source!.title : "Saved personal evidence",
            passages: passages(reference, changed ? undefined : fields),
            ...(available ? { sourceHref: `/read/${current.contentItemId}` } : {}) };
    }
    // Verify current library membership independently of public editorial visibility.
    const { data: membership, error: membershipError } = await supabase.from("user_library").select("content_id")
        .eq("user_id", options.userId).eq("content_id", reference.contentItemId).abortSignal(signal).maybeSingle();
    if (membershipError) throw new Error("Citation membership unavailable");
    if (!membership) return { state: "unavailable" };
    const { data: row, error } = await supabase.from("segment")
        .select("id,item_id,markdown_body,content_item(id,title,status,deleted_at)")
        .eq("id", reference.id).eq("item_id", reference.contentItemId).is("deleted_at", null).abortSignal(signal).maybeSingle();
    if (error) throw new Error("Citation source unavailable");
    const source = row?.content_item;
    if (!row || !source || source.status !== "verified" || source.deleted_at !== null) return { state: "withdrawn" };
    const fingerprint = createHash("sha256").update(JSON.stringify([row.id, row.item_id, source.title, row.markdown_body])).digest("hex");
    if (fingerprint !== reference.fingerprint) return { state: "changed", kind: "source_segment", title: source.title };
    return { state: "available", kind: "source_segment", title: source.title,
        passages: passages(reference, { source: row.markdown_body }), sourceHref: `/read/${row.item_id}` };
}
