"use client";

import type { ContentItem } from "@/types/database";
import type { StorageScope } from "@/lib/local-user-storage";

const BROWSE_RECOMMENDATION_CACHE_KEY_PREFIX = "netflux_browse_recommendation_cache_";
const BROWSE_RECOMMENDATION_CACHE_MAX_ENTRIES = 6;
const BROWSE_RECOMMENDATION_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

export interface BrowseRecommendationData {
    recentItems: ContentItem[];
    libraryItems: ContentItem[];
}

interface BrowseRecommendationCacheEntry {
    cacheKey: string;
    storedAt: string;
    data: BrowseRecommendationData;
}

function browseRecommendationCacheKey(scope: StorageScope) {
    return `${BROWSE_RECOMMENDATION_CACHE_KEY_PREFIX}${scope}`;
}

function parseTimestampMs(value: string) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function sanitizeContentItems(input: unknown) {
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

function sanitizeData(input: unknown): BrowseRecommendationData {
    if (!input || typeof input !== "object") {
        return {
            recentItems: [],
            libraryItems: [],
        };
    }

    const candidate = input as Partial<BrowseRecommendationData>;

    return {
        recentItems: sanitizeContentItems(candidate.recentItems),
        libraryItems: sanitizeContentItems(candidate.libraryItems),
    };
}

function sanitizeEntries(input: unknown, now: number) {
    if (!Array.isArray(input)) {
        return [] as BrowseRecommendationCacheEntry[];
    }

    const cutoff = now - BROWSE_RECOMMENDATION_CACHE_TTL_MS;
    const deduped = new Map<string, BrowseRecommendationCacheEntry>();

    for (const entry of input) {
        if (!entry || typeof entry !== "object") continue;

        const candidate = entry as Partial<BrowseRecommendationCacheEntry>;
        if (typeof candidate.cacheKey !== "string" || candidate.cacheKey.length === 0) continue;
        if (typeof candidate.storedAt !== "string") continue;

        const storedAtMs = parseTimestampMs(candidate.storedAt);
        if (storedAtMs < cutoff) continue;

        const existing = deduped.get(candidate.cacheKey);
        if (!existing || storedAtMs > parseTimestampMs(existing.storedAt)) {
            deduped.set(candidate.cacheKey, {
                cacheKey: candidate.cacheKey,
                storedAt: candidate.storedAt,
                data: sanitizeData(candidate.data),
            });
        }
    }

    return [...deduped.values()]
        .sort((a, b) => parseTimestampMs(b.storedAt) - parseTimestampMs(a.storedAt))
        .slice(0, BROWSE_RECOMMENDATION_CACHE_MAX_ENTRIES);
}

export function readCachedBrowseRecommendations(
    storage: Storage,
    scope: StorageScope,
    cacheKey: string,
    now = Date.now(),
) {
    try {
        const raw = storage.getItem(browseRecommendationCacheKey(scope));
        if (!raw) {
            return null;
        }

        const entries = sanitizeEntries(JSON.parse(raw), now);
        return entries.find((entry) => entry.cacheKey === cacheKey) ?? null;
    } catch {
        try {
            storage.removeItem(browseRecommendationCacheKey(scope));
        } catch {
            // Ignore storage cleanup failures and degrade gracefully.
        }

        return null;
    }
}

export function clearCachedBrowseRecommendations(
    storage: Storage,
    scope: StorageScope,
) {
    try {
        storage.removeItem(browseRecommendationCacheKey(scope));
    } catch {
        // Ignore storage cleanup failures and degrade gracefully.
    }
}

export function recordCachedBrowseRecommendations(
    storage: Storage,
    scope: StorageScope,
    cacheKey: string,
    data: BrowseRecommendationData,
    now = Date.now(),
) {
    if (cacheKey.length === 0) {
        return;
    }

    const key = browseRecommendationCacheKey(scope);
    let existingEntries: BrowseRecommendationCacheEntry[] = [];

    try {
        const raw = storage.getItem(key);
        if (raw) {
            existingEntries = sanitizeEntries(JSON.parse(raw), now);
        }
    } catch {
        try {
            storage.removeItem(key);
        } catch {
            // Ignore storage cleanup failures and degrade gracefully.
        }
    }

    const nextEntries = sanitizeEntries(
        [
            ...existingEntries.filter((entry) => entry.cacheKey !== cacheKey),
            {
                cacheKey,
                storedAt: new Date(now).toISOString(),
                data: sanitizeData(data),
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
