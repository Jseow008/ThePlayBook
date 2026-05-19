import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseMaybeUrl } from "@/lib/content-requests";

interface RequestMetadata {
    title?: string;
    thumbnail_url?: string;
}

const METADATA_TIMEOUT_MS = 3_000;
const DNS_LOOKUP_TIMEOUT_MS = 1_500;
const MAX_HTML_BYTES = 250_000;
const MAX_REDIRECTS = 3;
const PRIVATE_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

class UnsafeMetadataUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnsafeMetadataUrlError";
    }
}

function parseIPv4(value: string) {
    const parts = value.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return null;
    }
    return parts;
}

function isBlockedIPv4(value: string) {
    const parts = parseIPv4(value);
    if (!parts) return true;

    const [a, b] = parts;
    return (
        a === 0
        || a === 10
        || a === 127
        || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || (a === 198 && (b === 18 || b === 19))
        || a >= 224
    );
}

function isBlockedIPv6(value: string) {
    const normalized = value.toLowerCase();
    const mappedIPv4 = normalized.match(/(?:::ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/);

    if (mappedIPv4) {
        return isBlockedIPv4(mappedIPv4[1]);
    }

    return (
        normalized === "::"
        || normalized === "::1"
        || normalized.startsWith("fc")
        || normalized.startsWith("fd")
        || normalized.startsWith("fe8")
        || normalized.startsWith("fe9")
        || normalized.startsWith("fea")
        || normalized.startsWith("feb")
        || normalized.startsWith("ff")
    );
}

function isBlockedIpAddress(value: string) {
    const ipVersion = isIP(value);
    if (ipVersion === 4) return isBlockedIPv4(value);
    if (ipVersion === 6) return isBlockedIPv6(value);
    return false;
}

function isBlockedHostname(hostname: string) {
    const normalized = hostname.toLowerCase().replace(/\.$/, "");
    return PRIVATE_HOSTNAMES.has(normalized)
        || normalized.endsWith(".localhost")
        || normalized === "";
}

async function assertPublicHttpUrl(url: URL) {
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new UnsafeMetadataUrlError("Only HTTP and HTTPS URLs can be fetched.");
    }

    if (url.username || url.password) {
        throw new UnsafeMetadataUrlError("Credential-bearing URLs cannot be fetched.");
    }

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (isBlockedHostname(hostname) || isBlockedIpAddress(hostname)) {
        throw new UnsafeMetadataUrlError("Private or local URLs cannot be fetched.");
    }

    const addresses = await lookupWithTimeout(hostname);
    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIpAddress(address))) {
        throw new UnsafeMetadataUrlError("Private or local URLs cannot be fetched.");
    }
}

async function lookupWithTimeout(hostname: string) {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            lookup(hostname, { all: true, verbatim: true }),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(
                    () => reject(new UnsafeMetadataUrlError("DNS lookup timed out.")),
                    DNS_LOOKUP_TIMEOUT_MS
                );
            }),
        ]);
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

function getMetaContent(html: string, property: string) {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
        `<meta\\s+[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>|` +
        `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
        "i"
    );
    const match = html.match(pattern);
    return decodeHtmlEntities(match?.[1] || match?.[2] || "");
}

function decodeHtmlEntities(value: string) {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
}

function getTitle(html: string) {
    const ogTitle = getMetaContent(html, "og:title") || getMetaContent(html, "twitter:title");
    if (ogTitle) return ogTitle;

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return decodeHtmlEntities(titleMatch?.[1] || "");
}

async function fetchWithTimeout(url: URL, headers?: HeadersInit, redirectsRemaining = MAX_REDIRECTS): Promise<Response> {
    await assertPublicHttpUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            headers,
            redirect: "manual",
            signal: controller.signal,
            next: { revalidate: 60 * 60 * 24 },
        });

        if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
            if (redirectsRemaining <= 0) {
                throw new UnsafeMetadataUrlError("Too many redirects while fetching metadata.");
            }

            const redirectUrl = new URL(response.headers.get("location")!, url);
            return fetchWithTimeout(redirectUrl, headers, redirectsRemaining - 1);
        }

        return response;
    } finally {
        clearTimeout(timeout);
    }
}

async function readLimitedText(response: Response, maxBytes: number) {
    if (!response.body) {
        return "";
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (totalBytes < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value) break;

        const remainingBytes = maxBytes - totalBytes;
        const chunk = value.length > remainingBytes ? value.slice(0, remainingBytes) : value;
        chunks.push(chunk);
        totalBytes += chunk.length;

        if (value.length > remainingBytes) {
            await reader.cancel();
            break;
        }
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }

    return new TextDecoder().decode(merged);
}

async function cleanPublicMetadataUrl(value: string | undefined, baseUrl: string) {
    if (!value) return undefined;

    try {
        const parsed = new URL(value, baseUrl);
        await assertPublicHttpUrl(parsed);
        return parsed.toString();
    } catch {
        return undefined;
    }
}

async function fetchYoutubeMetadata(url: string): Promise<RequestMetadata | null> {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("format", "json");

    const response = await fetchWithTimeout(endpoint, {
        accept: "application/json",
    });

    if (!response.ok) return null;

    const data = await response.json() as {
        title?: string;
        thumbnail_url?: string;
    };

    return {
        title: data.title?.trim() || undefined,
        thumbnail_url: await cleanPublicMetadataUrl(data.thumbnail_url?.trim(), url),
    };
}

async function fetchOpenGraphMetadata(url: string): Promise<RequestMetadata | null> {
    const parsed = new URL(url);
    const response = await fetchWithTimeout(parsed, {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "NetfluxBot/1.0 (+https://netflux.app)",
    });

    if (!response.ok) return null;

    const html = await readLimitedText(response, MAX_HTML_BYTES);
    const title = getTitle(html);
    const thumbnailUrl = getMetaContent(html, "og:image") || getMetaContent(html, "twitter:image");

    return {
        title: title || undefined,
        thumbnail_url: await cleanPublicMetadataUrl(thumbnailUrl, parsed.toString()),
    };
}

export async function fetchRequestMetadata(url: string): Promise<RequestMetadata> {
    const parsed = parseMaybeUrl(url);
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
        return {};
    }

    try {
        const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
        if (hostname === "youtube.com" || hostname === "youtu.be") {
            const youtubeMetadata = await fetchYoutubeMetadata(parsed.toString());
            if (youtubeMetadata?.title || youtubeMetadata?.thumbnail_url) {
                return youtubeMetadata;
            }
        }

        return await fetchOpenGraphMetadata(parsed.toString()) ?? {};
    } catch {
        return {};
    }
}
