import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { parseMaybeUrl } from "@/lib/content-requests";

interface RequestMetadata {
    title?: string;
    thumbnail_url?: string;
}

const METADATA_TIMEOUT_MS = 3_000;
const DNS_LOOKUP_TIMEOUT_MS = 1_500;
const MAX_METADATA_BYTES = 250_000;
const MAX_REDIRECTS = 3;
const PRIVATE_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

class UnsafeMetadataUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnsafeMetadataUrlError";
    }
}

function isBlockedIPv4(value: string) {
    const [a, b, c] = value.split(".").map(Number);
    return (
        a === 0
        || a === 10
        || a === 127
        || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
        || (a === 198 && (b === 18 || b === 19))
        || (a === 198 && b === 51 && c === 100)
        || (a === 203 && b === 0 && c === 113)
        || a >= 224
    );
}

function publicAddress(value: string): string | null {
    const version = isIP(value);
    if (version === 4) return isBlockedIPv4(value) ? null : value;
    if (version !== 6) return null;

    const normalized = new URL(`http://[${value}]`).hostname.slice(1, -1);
    const mapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mapped) {
        const high = Number.parseInt(mapped[1], 16);
        const low = Number.parseInt(mapped[2], 16);
        return publicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }

    // Only global unicast, excluding special-use, documentation and 6to4 ranges.
    const [prefix, subnet] = normalized.split(":", 2);
    const first = Number.parseInt(prefix, 16);
    const second = Number.parseInt(subnet || "0", 16);
    if (!(first >= 0x2000 && first <= 0x3fff) || first === 0x2002 || first === 0x3fff
        || (first === 0x2001 && (second < 0x200 || second === 0xdb8))) return null;
    return normalized;
}

function isBlockedHostname(hostname: string) {
    const normalized = hostname.toLowerCase().replace(/\.$/, "");
    return PRIVATE_HOSTNAMES.has(normalized)
        || normalized.endsWith(".localhost")
        || normalized === "";
}

async function resolvePublicAddress(url: URL, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new UnsafeMetadataUrlError("Only HTTP and HTTPS URLs can be fetched.");
    }

    if (url.username || url.password) {
        throw new UnsafeMetadataUrlError("Credential-bearing URLs cannot be fetched.");
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (isBlockedHostname(hostname)) {
        throw new UnsafeMetadataUrlError("Private or local URLs cannot be fetched.");
    }

    const addresses = isIP(hostname) ? [hostname] : (await lookupWithTimeout(hostname, signal)).map(({ address }) => address);
    const validated = addresses.map(publicAddress);
    if (validated.length === 0 || !validated.every((address): address is string => address !== null)) {
        throw new UnsafeMetadataUrlError("Private or local URLs cannot be fetched.");
    }
    return validated.find(address => isIP(address) === 4) ?? validated[0];
}

function lookupWithTimeout(hostname: string, signal: AbortSignal) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(DNS_LOOKUP_TIMEOUT_MS)]);
    deadline.throwIfAborted();
    return new Promise<LookupAddress[]>((resolve, reject) => {
        const abort = () => reject(deadline.reason);
        deadline.addEventListener("abort", abort, { once: true });
        void lookup(hostname, { all: true }).then(resolve, reject).finally(() => deadline.removeEventListener("abort", abort));
    });
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

async function fetchMetadataText(
    url: URL,
    headers: Record<string, string>,
    signal: AbortSignal,
    redirectsRemaining = MAX_REDIRECTS,
): Promise<string | null> {
    const address = await resolvePublicAddress(url, signal);
    signal.throwIfAborted();
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const originalHost = url.hostname.replace(/^\[|\]$/g, "");
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
        // Connect to the checked address without a second DNS lookup or a pooled socket.
        request({
            hostname: address,
            port: url.port || undefined,
            path: url.pathname + url.search,
            headers: { ...headers, host: url.host, "accept-encoding": "identity" },
            servername: isIP(originalHost) ? "" : originalHost.replace(/\.$/, ""),
            rejectUnauthorized: true,
            agent: false,
            signal,
        }, resolve).once("error", reject).end();
    });

    try {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
            if (redirectsRemaining <= 0) {
                throw new UnsafeMetadataUrlError("Too many redirects while fetching metadata.");
            }
            return fetchMetadataText(new URL(response.headers.location, url), headers, signal, redirectsRemaining - 1);
        }
        const encoding = response.headers["content-encoding"]?.trim().toLowerCase();
        if (status < 200 || status >= 300 || (encoding && encoding !== "identity")) return null;
        return await readLimitedText(response);
    } finally {
        response.destroy();
    }
}

async function readLimitedText(response: IncomingMessage) {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of response) {
        const bounded: Buffer = chunk.subarray(0, MAX_METADATA_BYTES - totalBytes);
        chunks.push(bounded);
        totalBytes += bounded.length;
        if (totalBytes === MAX_METADATA_BYTES) break;
    }
    return Buffer.concat(chunks, totalBytes).toString("utf8");
}

async function cleanPublicMetadataUrl(value: string | undefined, baseUrl: string, signal: AbortSignal) {
    if (!value) return undefined;

    try {
        const parsed = new URL(value, baseUrl);
        await resolvePublicAddress(parsed, signal);
        return parsed.toString();
    } catch {
        return undefined;
    }
}

async function fetchYoutubeMetadata(url: string, signal: AbortSignal): Promise<RequestMetadata | null> {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("format", "json");

    const body = await fetchMetadataText(endpoint, {
        accept: "application/json",
    }, signal);
    if (!body) return null;

    const data = JSON.parse(body) as {
        title?: string;
        thumbnail_url?: string;
    };

    return {
        title: data.title?.trim() || undefined,
        thumbnail_url: await cleanPublicMetadataUrl(data.thumbnail_url?.trim(), url, signal),
    };
}

async function fetchOpenGraphMetadata(url: string, signal: AbortSignal): Promise<RequestMetadata | null> {
    const parsed = new URL(url);
    const html = await fetchMetadataText(parsed, {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "NetfluxBot/1.0 (+https://netflux.app)",
    }, signal);
    if (!html) return null;
    const title = getTitle(html);
    const thumbnailUrl = getMetaContent(html, "og:image") || getMetaContent(html, "twitter:image");

    return {
        title: title || undefined,
        thumbnail_url: await cleanPublicMetadataUrl(thumbnailUrl, parsed.toString(), signal),
    };
}

export async function fetchRequestMetadata(url: string): Promise<RequestMetadata> {
    const parsed = parseMaybeUrl(url);
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
        return {};
    }

    try {
        const signal = AbortSignal.timeout(METADATA_TIMEOUT_MS);
        const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
        if (hostname === "youtube.com" || hostname === "youtu.be") {
            const youtubeMetadata = await fetchYoutubeMetadata(parsed.toString(), signal);
            if (youtubeMetadata?.title || youtubeMetadata?.thumbnail_url) {
                return youtubeMetadata;
            }
        }

        return await fetchOpenGraphMetadata(parsed.toString(), signal) ?? {};
    } catch {
        return {};
    }
}
