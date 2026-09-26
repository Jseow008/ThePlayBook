import { z } from "zod";

export const CitationLinkSchema = z.object({
    label: z.string().min(1).max(400),
    href: z.string().max(24_000).regex(/^\/evidence#[A-Za-z0-9_-]+$/),
});
export type CitationLink = z.infer<typeof CitationLinkSchema>;
export const CitationResolutionSchema = z.object({
    state: z.enum(["available", "changed", "withdrawn", "unavailable"]),
    title: z.string().optional(),
    kind: z.enum(["highlight", "reflection", "source_segment"]).optional(),
    passages: z.array(z.object({
        label: z.string(), text: z.string(), before: z.string(), after: z.string(),
    })).optional(),
    sourceHref: z.string().regex(/^\/read\/[0-9a-f-]+$/).optional(),
});
export type CitationResolution = z.infer<typeof CitationResolutionSchema>;

/** Stored/model-provided text is never parsed into trusted citation metadata. */
export function getMessageCitations(message: { parts?: readonly unknown[] }): CitationLink[] {
    const links = (message.parts ?? []).flatMap((part) => {
        if (!part || typeof part !== "object" || !("type" in part) || part.type !== "data-citations" || !("data" in part)) return [];
        const parsed = z.array(CitationLinkSchema).max(8).safeParse(part.data);
        return parsed.success ? parsed.data : [];
    });
    return links.slice(0, 8);
}

/** Exact quotations bypass Markdown so punctuation cannot become formatting/links. */
export function isExactQuotation(message: { parts?: readonly unknown[] }): boolean {
    return (message.parts ?? []).some((part) => Boolean(part && typeof part === "object" && "type" in part
        && part.type === "data-exact-quotation" && "data" in part && part.data === true));
}
