"use client";

import type { StorageScope } from "@/lib/local-user-storage";

const RECENT_RECOMMENDATIONS_KEY_PREFIX = "flux_recent_recommendations_";
const RECENT_RECOMMENDATIONS_MAX_ENTRIES = 24;
const RECENT_RECOMMENDATION_TTL_MS = 1000 * 60 * 60 * 24 * 3;

interface RecentRecommendationEntry {
    id: string;
    shownAt: string;
}

function recentRecommendationsKey(scope: StorageScope) {
    return `${RECENT_RECOMMENDATIONS_KEY_PREFIX}${scope}`;
}

export function isRecentRecommendationsStorageKey(key: string | null, scope: StorageScope) {
    return key === recentRecommendationsKey(scope);
}

function parseTimestampMs(value: string) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
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
