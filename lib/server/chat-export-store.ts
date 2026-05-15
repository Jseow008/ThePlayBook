import { Redis } from "@upstash/redis";
import { CHAT_EXPORT_TTL_SECONDS, type StoredChatExportPayload } from "@/lib/chat-export";

const KEY_PREFIX = "netflux:chat-export:";

let redis: Redis | null = null;
const fallbackStore = new Map<string, StoredChatExportPayload>();

function hasRedisConfig() {
    return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function isProductionEnvironment() {
    return process.env.NODE_ENV === "production";
}

function getRedis() {
    if (!hasRedisConfig()) {
        if (isProductionEnvironment()) {
            throw new Error("Upstash Redis must be configured for temporary chat exports in production.");
        }

        return null;
    }

    if (!redis) {
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });
    }

    return redis;
}

function getExportKey(id: string): string {
    return `${KEY_PREFIX}${id}`;
}

function cleanupFallbackStore(now = Date.now()) {
    for (const [key, value] of fallbackStore.entries()) {
        if (new Date(value.expiresAt).getTime() <= now) {
            fallbackStore.delete(key);
        }
    }
}

export async function saveChatExport(
    id: string,
    payload: StoredChatExportPayload
): Promise<void> {
    const client = getRedis();
    const key = getExportKey(id);

    if (client) {
        await client.set(key, payload, { ex: CHAT_EXPORT_TTL_SECONDS });
        return;
    }

    cleanupFallbackStore();
    fallbackStore.set(key, payload);
}

export async function readChatExport(id: string): Promise<StoredChatExportPayload | null> {
    const client = getRedis();
    const key = getExportKey(id);

    if (client) {
        return await client.get<StoredChatExportPayload>(key);
    }

    cleanupFallbackStore();
    return fallbackStore.get(key) ?? null;
}

export function clearFallbackChatExportsForTests() {
    fallbackStore.clear();
}
