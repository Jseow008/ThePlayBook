import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const VISITOR_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSecret() {
    return process.env.ANONYMOUS_ACTIVITY_SECRET?.trim() ?? "";
}

function isProductionRuntime() {
    return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function sign(visitorId: string, expiresAt: number, secret: string) {
    return createHmac("sha256", secret)
        .update(`${TOKEN_VERSION}.${visitorId}.${expiresAt}`)
        .digest("base64url");
}

function safeEqual(a: string, b: string) {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);

    return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export function createAnonymousActivitySession() {
    const secret = getSecret();
    if (!secret) {
        if (isProductionRuntime()) {
            throw new Error("ANONYMOUS_ACTIVITY_SECRET is required in production.");
        }

        const visitorId = randomUUID();
        return {
            visitorId,
            visitorToken: "",
            expiresAt: Date.now() + TOKEN_TTL_MS,
        };
    }

    const visitorId = randomUUID();
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    return {
        visitorId,
        visitorToken: `${TOKEN_VERSION}.${visitorId}.${expiresAt}.${sign(visitorId, expiresAt, secret)}`,
        expiresAt,
    };
}

export function verifyAnonymousActivityToken(visitorId: string, token: string | null | undefined) {
    const secret = getSecret();

    if (!VISITOR_ID_REGEX.test(visitorId)) {
        return false;
    }

    if (!secret) {
        return !isProductionRuntime();
    }

    if (!token) {
        return false;
    }

    const [version, tokenVisitorId, expiresAtRaw, signature] = token.split(".");
    const expiresAt = Number(expiresAtRaw);

    if (
        version !== TOKEN_VERSION ||
        tokenVisitorId !== visitorId ||
        !Number.isSafeInteger(expiresAt) ||
        expiresAt <= Date.now() ||
        !signature
    ) {
        return false;
    }

    return safeEqual(signature, sign(visitorId, expiresAt, secret));
}
