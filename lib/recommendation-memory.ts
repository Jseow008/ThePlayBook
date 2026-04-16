"use client";

import type { ContentItem } from "@/types/database";
import type { StorageScope } from "@/lib/local-user-storage";

const RECENT_RECOMMENDATIONS_KEY_PREFIX = "flux_recent_recommendations_";
const RECENT_RECOMMENDATIONS_MAX_ENTRIES = 24;
const RECENT_RECOMMENDATION_TTL_MS = 1000 * 60 * 60 * 24 * 3;
const RECOMMENDATION_CACHE_KEY_PREFIX = "flux_recommendation_cache_";
const RECOMMENDATION_CACHE_MAX_ENTRIES = 8;
const RECOMMENDATION_CACHE_TTL_MS = 1000 * 60 * 5;

interface RecentRecommendationEntry {
    id: string;
    shownAt: string;
}

interface RecommendationCacheEntry {
    cacheKey: string;
    storedAt: string;
    items: ContentItem[];
}

function recentRecommendationsKey(scope: StorageScope) {
    return `${RECENT_RECOMMENDATIONS_KEY_PREFIX}${scope}`;
}

function recommendationCacheKey(scope: StorageScope) {
    return `${RECOMMENDATION_CACHE_KEY_PREFIX}${scope}`;
}

export function isRecentRecommendationsStorageKey(key: string | null, scope: StorageScope) {
    return key === recentRecommendationsKey(scope);
}

function parseTimestampMs(value: string) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function sanitizeRecommendationItems(input: unknown) {
    if (!Array.isArray(input)) {
        return [] as ContentItem[];
    }

    return input.filter((entry): entry is ContentItem => {
        if (!entry || typeof entry !== "object") {
            return false;
        }

        return typeof (entry as { id?: unknown }).id === "string";
    });
}

function sanitizeEntries(input: unknown, now: number) {
    if (!Array.isArray(input)) {
        return [] as RecentRecommendationEntry[];
    }

    const cutoff = now - RECENT_RECOMMENDATION_TTL_MS;
    const deduped = new Map<string, RecentRecommendationEntry>();

    for (const entry of input) {
        if (!entry || typeof entry !== "object") continue;

        const candidate = entry as Partial<RecentRecommendationEntry>;
        if (typeof candidate.id !== "string" || candidate.id.length === 0) continue;
        if (typeof candidate.shownAt !== "string") continue;

        const shownAtMs = parseTimestampMs(candidate.shownAt);
        if (shownAtMs < cutoff) continue;

        const existing = deduped.get(candidate.id);
        if (!existing || shownAtMs > parseTimestampMs(existing.shownAt)) {
            deduped.set(candidate.id, {
                id: candidate.id,
                shownAt: candidate.shownAt,
            });
        }
    }

    return [...deduped.values()]
        .sort((a, b) => parseTimestampMs(b.shownAt) - parseTimestampMs(a.shownAt))
        .slice(0, RECENT_RECOMMENDATIONS_MAX_ENTRIES);
}

function sanitizeRecommendationCacheEntries(input: unknown, now: number) {
    if (!Array.isArray(input)) {
        return [] as RecommendationCacheEntry[];
    }

    const cutoff = now - RECOMMENDATION_CACHE_TTL_MS;
    const deduped = new Map<string, RecommendationCacheEntry>();

    for (const entry of input) {
        if (!entry || typeof entry !== "object") continue;

        const candidate = entry as Partial<RecommendationCacheEntry>;
        if (typeof candidate.cacheKey !== "string" || candidate.cacheKey.length === 0) continue;
        if (typeof candidate.storedAt !== "string") continue;

        const storedAtMs = parseTimestampMs(candidate.storedAt);
        if (storedAtMs < cutoff) continue;

        const items = sanitizeRecommendationItems(candidate.items);
        const existing = deduped.get(candidate.cacheKey);
        if (!existing || storedAtMs > parseTimestampMs(existing.storedAt)) {
            deduped.set(candidate.cacheKey, {
                cacheKey: candidate.cacheKey,
                storedAt: candidate.storedAt,
                items,
            });
        }
    }

    return [...deduped.values()]
        .sort((a, b) => parseTimestampMs(b.storedAt) - parseTimestampMs(a.storedAt))
        .slice(0, RECOMMENDATION_CACHE_MAX_ENTRIES);
}

function writeEntries(storage: Storage, scope: StorageScope, entries: RecentRecommendationEntry[]) {
    try {
        storage.setItem(recentRecommendationsKey(scope), JSON.stringify(entries));
        return true;
    } catch {
        return false;
    }
}

function removeEntries(storage: Storage, scope: StorageScope) {
    try {
        storage.removeItem(recentRecommendationsKey(scope));
    } catch {
        // Ignore storage cleanup failures and degrade gracefully.
    }
}

export function clearRecentRecommendations(
    storage: Storage,
    scope: StorageScope,
) {
    removeEntries(storage, scope);
}

export function readRecentRecommendationIds(
    storage: Storage,
    scope: StorageScope,
    now = Date.now(),
) {
    const key = recentRecommendationsKey(scope);

    try {
        const raw = storage.getItem(key);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        return sanitizeEntries(parsed, now).map((entry) => entry.id);
    } catch {
        removeEntries(storage, scope);
        return [];
    }
}

export function readCachedRecommendations(
    storage: Storage,
    scope: StorageScope,
    cacheKey: string,
    now = Date.now(),
) {
    try {
        const raw = storage.getItem(recommendationCacheKey(scope));
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        const entries = sanitizeRecommendationCacheEntries(parsed, now);
        const match = entries.find((entry) => entry.cacheKey === cacheKey);
        return match ?? null;
    } catch {
        try {
            storage.removeItem(recommendationCacheKey(scope));
        } catch {
            // Ignore storage cleanup failures and degrade gracefully.
        }

        return null;
    }
}

export function recordCachedRecommendations(
    storage: Storage,
    scope: StorageScope,
    cacheKey: string,
    items: ContentItem[],
    now = Date.now(),
) {
    if (cacheKey.length === 0) {
        return;
    }

    const key = recommendationCacheKey(scope);
    let existingEntries: RecommendationCacheEntry[] = [];

    try {
        const raw = storage.getItem(key);
        if (raw) {
            existingEntries = sanitizeRecommendationCacheEntries(JSON.parse(raw), now);
        }
    } catch {
        try {
            storage.removeItem(key);
        } catch {
            // Ignore storage cleanup failures and degrade gracefully.
        }
    }

    const storedAt = new Date(now).toISOString();
    const nextEntries = sanitizeRecommendationCacheEntries(
        [
            ...existingEntries.filter((entry) => entry.cacheKey !== cacheKey),
            {
                cacheKey,
                storedAt,
                items: sanitizeRecommendationItems(items),
            },
        ],
        now,
    );

    try {
        storage.setItem(key, JSON.stringify(nextEntries));
    } catch {
        // Ignore storage quota failures and degrade gracefully.
    }
}

export function clearCachedRecommendations(
    storage: Storage,
    scope: StorageScope,
) {
    try {
        storage.removeItem(recommendationCacheKey(scope));
    } catch {
        // Ignore storage cleanup failures and degrade gracefully.
    }
}

export function recordRecentRecommendations(
    storage: Storage,
    scope: StorageScope,
    ids: string[],
    now = Date.now(),
) {
    const nextIds = Array.from(new Set(ids.filter(Boolean)));
    if (nextIds.length === 0) {
        return;
    }

    const key = recentRecommendationsKey(scope);
    let existingEntries: RecentRecommendationEntry[] = [];

    try {
        const raw = storage.getItem(key);
        if (raw) {
            existingEntries = sanitizeEntries(JSON.parse(raw), now);
        }
    } catch {
        removeEntries(storage, scope);
    }

    const shownAt = new Date(now).toISOString();
    const nextEntries = sanitizeEntries(
        [
            ...nextIds.map((id) => ({ id, shownAt })),
            ...existingEntries,
        ],
        now,
    );

    writeEntries(storage, scope, nextEntries);
}
