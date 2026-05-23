import { normalizeText } from "@/lib/content-requests";
import type { ContentType } from "@/types/database";

const GOOGLE_BOOKS_TIMEOUT_MS = 1_500;
const OPEN_LIBRARY_TIMEOUT_MS = 3_500;
const MAX_THUMBNAIL_URL_LENGTH = 1_000;
const BOOK_RESULT_LIMIT = "5";

const TITLE_STOP_WORDS = new Set([
    "a",
    "an",
    "and",
    "for",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
]);

interface RequestThumbnailInput {
    content_type: ContentType;
    title: string;
    author?: string | null;
    source_url?: string | null;
}

interface GoogleBooksVolume {
    volumeInfo?: {
        title?: string;
        subtitle?: string;
        authors?: string[];
        imageLinks?: {
            smallThumbnail?: string;
            thumbnail?: string;
            small?: string;
            medium?: string;
            large?: string;
            extraLarge?: string;
        };
    };
}

type GoogleBooksImageLinks = NonNullable<GoogleBooksVolume["volumeInfo"]>["imageLinks"];

interface GoogleBooksResponse {
    items?: GoogleBooksVolume[];
}

interface OpenLibraryDoc {
    title?: string;
    author_name?: string[];
    cover_i?: number;
}

interface OpenLibraryResponse {
    docs?: OpenLibraryDoc[];
}

function requestThumbnailUserAgent() {
    return process.env.OPEN_LIBRARY_USER_AGENT
        || process.env.REQUEST_THUMBNAIL_USER_AGENT
        || "NetfluxBot/1.0 (+https://netflux.app)";
}

function stripSubtitle(value: string) {
    return value.split(":")[0]?.trim() || value.trim();
}

function tokenizeTitle(value: string) {
    return normalizeText(stripSubtitle(value))
        .split(" ")
        .filter((token) => token.length > 1 && !TITLE_STOP_WORDS.has(token));
}

function tokenizeAuthor(value: string | null | undefined) {
    return normalizeText(value ?? "")
        .split(" ")
        .filter((token) => token.length > 1 && !TITLE_STOP_WORDS.has(token));
}

function jaccardSimilarity(left: string[], right: string[]) {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    const union = new Set([...leftSet, ...rightSet]);
    if (union.size === 0) return 0;

    let intersection = 0;
    for (const token of leftSet) {
        if (rightSet.has(token)) {
            intersection += 1;
        }
    }

    return intersection / union.size;
}

export function isConfidentBookMatch({
    requestedTitle,
    requestedAuthor,
    candidateTitle,
    candidateAuthors,
}: {
    requestedTitle: string;
    requestedAuthor?: string | null;
    candidateTitle?: string | null;
    candidateAuthors?: string[] | null;
}) {
    if (!candidateTitle?.trim()) return false;

    const requestedTitleTokens = tokenizeTitle(requestedTitle);
    const candidateTitleTokens = tokenizeTitle(candidateTitle);
    if (requestedTitleTokens.length === 0 || candidateTitleTokens.length === 0) {
        return false;
    }

    const titleSimilarity = jaccardSimilarity(requestedTitleTokens, candidateTitleTokens);
    if (titleSimilarity < 0.72) {
        return false;
    }

    const requestedAuthorTokens = tokenizeAuthor(requestedAuthor);
    if (requestedAuthorTokens.length === 0) {
        return true;
    }

    const candidateAuthorTokens = new Set(tokenizeAuthor((candidateAuthors ?? []).join(" ")));
    return requestedAuthorTokens.some((token) => candidateAuthorTokens.has(token));
}

function cleanThumbnailUrl(value: string | null | undefined) {
    const trimmed = value?.trim();
    if (!trimmed) return null;

    const secureUrl = trimmed.replace(/^http:\/\//i, "https://");
    if (secureUrl.length > MAX_THUMBNAIL_URL_LENGTH) return null;

    try {
        const parsed = new URL(secureUrl);
        return parsed.protocol === "https:" ? parsed.toString() : null;
    } catch {
        return null;
    }
}

function bestGoogleImageLink(imageLinks: GoogleBooksImageLinks) {
    return imageLinks?.extraLarge
        || imageLinks?.large
        || imageLinks?.medium
        || imageLinks?.small
        || imageLinks?.thumbnail
        || imageLinks?.smallThumbnail
        || null;
}

async function fetchJsonWithTimeout<T>(url: URL, timeoutMs: number, headers: HeadersInit = {}): Promise<T | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            headers,
            signal: controller.signal,
            next: { revalidate: 60 * 60 * 24 },
        });

        if (!response.ok) return null;
        return await response.json() as T;
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchGoogleBooksCover(title: string, author?: string | null) {
    const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
    endpoint.searchParams.set("q", author ? `intitle:${title} inauthor:${author}` : `intitle:${title}`);
    endpoint.searchParams.set("printType", "books");
    endpoint.searchParams.set("projection", "lite");
    endpoint.searchParams.set("maxResults", BOOK_RESULT_LIMIT);

    if (process.env.GOOGLE_BOOKS_API_KEY) {
        endpoint.searchParams.set("key", process.env.GOOGLE_BOOKS_API_KEY);
    }

    const data = await fetchJsonWithTimeout<GoogleBooksResponse>(endpoint, GOOGLE_BOOKS_TIMEOUT_MS, {
        accept: "application/json",
        "user-agent": requestThumbnailUserAgent(),
    });

    for (const item of data?.items ?? []) {
        const volume = item.volumeInfo;
        const coverUrl = cleanThumbnailUrl(bestGoogleImageLink(volume?.imageLinks));
        if (!coverUrl) continue;

        const candidateTitle = [volume?.title, volume?.subtitle].filter(Boolean).join(": ");
        if (isConfidentBookMatch({
            requestedTitle: title,
            requestedAuthor: author,
            candidateTitle,
            candidateAuthors: volume?.authors,
        })) {
            return coverUrl;
        }
    }

    return null;
}

async function fetchOpenLibraryCover(title: string, author?: string | null) {
    const endpoint = new URL("https://openlibrary.org/search.json");
    endpoint.searchParams.set("q", [title, author].filter(Boolean).join(" "));
    endpoint.searchParams.set("limit", BOOK_RESULT_LIMIT);
    endpoint.searchParams.set("fields", "title,author_name,cover_i");

    const data = await fetchJsonWithTimeout<OpenLibraryResponse>(endpoint, OPEN_LIBRARY_TIMEOUT_MS, {
        accept: "application/json",
        "user-agent": requestThumbnailUserAgent(),
    });

    for (const doc of data?.docs ?? []) {
        if (!doc.cover_i) continue;

        if (isConfidentBookMatch({
            requestedTitle: title,
            requestedAuthor: author,
            candidateTitle: doc.title,
            candidateAuthors: doc.author_name,
        })) {
            return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        }
    }

    return null;
}

export async function resolveBookCover({
    title,
    author,
}: {
    title: string;
    author?: string | null;
}): Promise<string | null> {
    const cleanTitle = title.trim();
    const cleanAuthor = author?.trim() || null;
    if (!cleanTitle) return null;

    try {
        const googleCover = await fetchGoogleBooksCover(cleanTitle, cleanAuthor);
        if (googleCover) return googleCover;
    } catch (error) {
        console.warn("Google Books cover lookup failed:", error);
    }

    try {
        return await fetchOpenLibraryCover(cleanTitle, cleanAuthor);
    } catch (error) {
        console.warn("Open Library cover lookup failed:", error);
        return null;
    }
}

export async function resolveRequestThumbnail(request: RequestThumbnailInput): Promise<string | null> {
    if (request.content_type === "book") {
        return resolveBookCover({
            title: request.title,
            author: request.author,
        });
    }

    return null;
}
