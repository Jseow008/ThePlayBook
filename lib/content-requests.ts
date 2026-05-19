import type { ContentType } from "@/types/database";
import { buildCanonicalReadPath } from "@/lib/content-paths";
import type { ContentRequestBoardItem } from "@/types/content-requests";

const TRACKING_PARAMS = new Set([
    "fbclid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "ref",
    "ref_src",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
]);

const URL_CONTENT_TYPES: Array<{ pattern: RegExp; type: ContentType }> = [
    { pattern: /(^|\.)youtu\.be$/i, type: "video" },
    { pattern: /(^|\.)youtube\.com$/i, type: "video" },
    { pattern: /(^|\.)vimeo\.com$/i, type: "video" },
    { pattern: /(^|\.)spotify\.com$/i, type: "podcast" },
    { pattern: /(^|\.)podcasts\.apple\.com$/i, type: "podcast" },
    { pattern: /(^|\.)overcast\.fm$/i, type: "podcast" },
];

export function parseMaybeUrl(value: string): URL | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        return new URL(trimmed);
    } catch {
        if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
            try {
                return new URL(`https://${trimmed}`);
            } catch {
                return null;
            }
        }
        return null;
    }
}

export function normalizeUrl(value: string): string | null {
    const parsed = parseMaybeUrl(value);
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
        return null;
    }

    parsed.hash = "";
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    for (const key of Array.from(parsed.searchParams.keys())) {
        if (TRACKING_PARAMS.has(key.toLowerCase())) {
            parsed.searchParams.delete(key);
        }
    }

    parsed.searchParams.sort();

    const normalized = parsed.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function normalizeText(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

export function inferContentType(input: string, fallback: ContentType = "book"): ContentType {
    const parsed = parseMaybeUrl(input);
    if (!parsed) return fallback;

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const matchedType = URL_CONTENT_TYPES.find(({ pattern }) => pattern.test(hostname))?.type;
    return matchedType ?? "article";
}

export function splitTitleAndAuthor(input: string) {
    const trimmed = input.trim();
    const match = trimmed.match(/^(.+?)\s+(?:by|from)\s+(.+)$/i);

    if (!match) {
        return { title: trimmed, author: null };
    }

    return {
        title: match[1].trim(),
        author: match[2].trim() || null,
    };
}

export function deriveUrlTitle(input: string): string {
    const parsed = parseMaybeUrl(input);
    if (!parsed) return input.trim();

    const pathParts = parsed.pathname
        .split("/")
        .filter(Boolean)
        .map((part) => part.replace(/[-_]+/g, " ").trim())
        .filter(Boolean);

    return pathParts.at(-1) || parsed.hostname.replace(/^www\./, "");
}

export function getPublishedRequestHref(request: ContentRequestBoardItem) {
    if (!request.published_content) return null;
    return buildCanonicalReadPath(request.published_content.id, request.published_content.title);
}
