import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

/** Canonicalize one address; reject lists, ports, zone IDs, and malformed values. */
function normalizeIp(value: string | null): string | null {
    if (!value || value.length > 45 || value.includes("%")) return null;
    const version = isIP(value);
    if (version === 4) return value;
    if (version !== 6) return null;
    const canonical = new URL(`http://[${value}]`).hostname.slice(1, -1);
    const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(canonical);
    if (!mapped) return canonical;
    const high = parseInt(mapped[1], 16);
    const low = parseInt(mapped[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/** Vercel overwrites this header at ingress. Never trust arbitrary forwarding headers. */
export function trustedNetworkIdentifier(request: NextRequest): string | null {
    const hosted = process.env.VERCEL === "1";
    const production = process.env.NODE_ENV === "production";
    // A production server on another host needs a reviewed ingress contract first.
    if (!hosted && production) return null;
    const ip = normalizeIp(request.headers.get(hosted ? "x-vercel-forwarded-for" : "x-forwarded-for"));
    if (!ip) return hosted || production ? null : "local-unknown";
    // Pseudonymous bucket identifier, not a claim that IP hashes are anonymous.
    return createHash("sha256").update(ip).digest("hex");
}
