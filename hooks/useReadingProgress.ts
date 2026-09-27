"use client";

import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { AuthUser as User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { commitUserLibraryMutation } from "@/lib/user-library-mutation-client";
import { toast } from "sonner";
import { LibraryMutationConflictError, LibraryMutationReceiptError, type LibraryBoundary, type LibraryMutationAcknowledgement, type LibraryGuestImport } from "@/lib/user-library-mutation-contract";
import { writeLibraryIntent, readLibraryIntents, removeLibraryIntent, clearLibraryIntents, storeLibraryBoundary, readLibraryBoundary, LIBRARY_JOURNAL_PREFIX, type LibraryJournalEntry } from "@/lib/library-mutation-journal";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
    clearScopedProgress,
    getScopedProgressKeys,
    getStorageScope,
    isScopeStorageEventKey,
    parseProgressItemId,
    progressKey,
    readScopedMyList,
    type StorageScope,
    writeScopedMyList,
    migrateLegacyStorageToGuest,
} from "@/lib/local-user-storage";
import { clearCachedBrowseRecommendations } from "@/lib/browse-recommendation-cache";
import { guestLibrarySources, bindGuestSource, consumeGuestSource, releaseGuestBinding } from "@/lib/guest-library-import";
import { captureAnalyticsEvent } from "@/lib/analytics";
import {
    clearLibrarySnapshotIdempotencyKey,
    fetchCompleteLibrarySnapshot,
    getLibrarySnapshotIdempotencyKey,
    LibrarySnapshotClientError,
} from "@/lib/account-data-client";
import {
    clearCachedRecommendations,
    clearRecentRecommendations,
} from "@/lib/recommendation-memory";

/**
 * Reading progress data stored in localStorage
 */
export type ProgressLibraryList = "reading" | "completed";

export interface ReadingProgressData {
    itemId: string;
    completed: string[];
    lastSegmentIndex: number;
    lastReadAt: string;
    completedAt?: string;
    isCompleted: boolean;
    totalSegments?: number;
    maxSegmentIndex?: number;
    archivedFromLists?: Partial<Record<ProgressLibraryList, boolean>>;
}

function getProgressLibraryList(data: ReadingProgressData): ProgressLibraryList {
    return data.isCompleted ? "completed" : "reading";
}

function isArchivedFromList(data: ReadingProgressData, list: ProgressLibraryList) {
    return data.archivedFromLists?.[list] === true;
}

function clearArchiveForCurrentList(data: ReadingProgressData): ReadingProgressData {
    const currentList = getProgressLibraryList(data);
    return clearArchiveForList(data, currentList);
}

function clearArchiveForList(data: ReadingProgressData, list: ProgressLibraryList): ReadingProgressData {
    const archivedFromLists = { ...(data.archivedFromLists ?? {}) };

    if (!archivedFromLists[list]) {
        return data;
    }

    delete archivedFromLists[list];

    return {
        ...data,
        archivedFromLists: Object.keys(archivedFromLists).length > 0
            ? archivedFromLists
            : undefined,
    };
}

function normalizeCloudSyncError(error: unknown) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
        };
    }

    if (typeof error === "string") {
        return { message: error };
    }

    if (!error || typeof error !== "object") {
        return { message: "Unknown cloud sync error" };
    }

    const candidate = error as Record<string, unknown>;
    const normalized = Object.fromEntries(
        Object.entries(candidate).filter(([, value]) => value !== undefined && value !== null)
    );

    if (Object.keys(normalized).length > 0) {
        return normalized;
    }

    return {
        message: "Unknown cloud sync error",
        rawType: Object.prototype.toString.call(error),
    };
}

function logRecoverableCloudSync(
    context: string,
    error: unknown,
    metadata: Record<string, unknown> = {}
) {
    console.warn(`[ReadingProgress] ${context}`, {
        ...metadata,
        error: normalizeCloudSyncError(error),
    });
}

function hasProgressData(value: ReadingProgressData | null) {
    return Boolean(value && Object.keys(value).length > 0);
}

function parseProgressTimestamp(value: string) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

type LocalLibraryMutation = {
    id: string;
    accountId: string;
    scope: StorageScope;
    itemId: string;
    sequence: number;
    sessionGeneration: number;
    isBookmarked: boolean;
    progress: ReadingProgressData | null;
    acknowledgement?: LibraryMutationAcknowledgement;
    createdAt: string;
    status: LibraryJournalEntry["status"];
    request?: LibraryJournalEntry["request"];
    guestImport?: LibraryGuestImport;
    base?: LibraryBoundary;
    predecessor?: LocalLibraryMutation;
    needsAttention?: boolean;
    reviewed?: boolean;
};

const terminalSnapshotOutcomeCodes = new Set([
    "SNAPSHOT_BUSY",
    "SNAPSHOT_WORKER_INTERRUPTED",
    "TIMED_OUT",
    "SNAPSHOT_TIMED_OUT",
    "SNAPSHOT_FAILED",
    "SNAPSHOT_TOO_LARGE",
    "SNAPSHOT_ACCOUNT_CAPACITY",
    "SNAPSHOT_CLEANUP_FAILED",
    "SNAPSHOT_EXPIRED",
    "IDEMPOTENCY_KEY_REUSED",
    "NOT_FOUND",
    "EXPIRED",
    "FAILED",
]);

function useReadingProgressController(initialUser?: User | null) {
    const queryClient = useQueryClient();
    const [inProgressIds, setInProgressIds] = useState<string[]>([]);
    const [completedIds, setCompletedIds] = useState<string[]>([]);
    const [myListIds, setMyListIds] = useState<string[]>([]);
    const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressData>>({});
    const [syncNeedsAttention, setSyncNeedsAttention] = useState(false);
    const [journalVersion, setJournalVersion] = useState(0);
    const [journalError, setJournalError] = useState(false);
    const retryPendingRef = useRef<() => Promise<void>>(async () => {});
    const activeWritesRef = useRef(new Set<AbortController>());
    const [isLoaded, setIsLoaded] = useState(false);
    const [hydrationStatus, setHydrationStatus] = useState<"idle" | "hydrating" | "ready" | "error">("idle");
    const [user, setUser] = useState<User | null>(initialUser ?? null);
    const [storageScope, setStorageScope] = useState<StorageScope>(getStorageScope(initialUser?.id));
    const scopeRef = useRef<StorageScope>(getStorageScope(null));
    const userRef = useRef<User | null>(null);
    const hydrateRunRef = useRef(0);
    const localMutationGenerationRef = useRef(0);
    const authenticationGenerationRef = useRef(0);
    const localMutationsRef = useRef(new Map<string, LocalLibraryMutation>());
    const mutationSequenceRef = useRef(0);
    const isLoadedRef = useRef(false);
    const didRunLegacyMigrationRef = useRef(false);
    const installedSnapshotStateRef = useRef(new Map<StorageScope, { resetEpoch: number; boundaryRevision: number }>());

    const confirmedBoundaryRef = useRef<LibraryBoundary | undefined>(undefined);
    const latestMutationRef = useRef<LocalLibraryMutation | undefined>(undefined);
    const mutationTailRef = useRef<Promise<unknown>>(Promise.resolve());
    const syncBlockedRef = useRef(false);
    const refreshLibraryRef = useRef<() => void>(() => {});

    const persistMutation = useCallback((mutation: LocalLibraryMutation) => {
        writeLibraryIntent(localStorage, {
            version: 1, id: mutation.id, accountId: mutation.accountId, itemId: mutation.itemId,
            sequence: mutation.sequence, createdAt: mutation.createdAt, isBookmarked: mutation.isBookmarked,
            progress: mutation.progress, base: mutation.base, predecessorId: mutation.predecessor?.acknowledgement ? undefined : mutation.predecessor?.id,
            request: mutation.request, acknowledgement: mutation.acknowledgement, guestImport: mutation.guestImport,
            needsAttention: mutation.needsAttention, status: mutation.status,
        });
        setJournalVersion(value => value + 1);
    }, []);

    const restoreJournal = useCallback((accountId: string) => {
        try {
            const { entries, unreadableKeys } = readLibraryIntents(localStorage, accountId);
            setJournalError(unreadableKeys.length > 0);
            for (const entry of entries) {
                if (entry.guestImport && entry.acknowledgement && (entry.acknowledgement.outcome !== "skipped" || entry.acknowledgement.reason === "source_already_imported")) {
                    consumeGuestSource(localStorage, { itemId: entry.itemId, isBookmarked: entry.isBookmarked, progress: entry.progress });
                }
                if (localMutationsRef.current.has(entry.id)) continue;
                localMutationsRef.current.set(entry.id, { ...entry, scope: getStorageScope(accountId), sessionGeneration: authenticationGenerationRef.current });
                mutationSequenceRef.current = Math.max(mutationSequenceRef.current, entry.sequence);
            }
            for (const entry of entries) {
                const mutation = localMutationsRef.current.get(entry.id)!;
                if (entry.predecessorId) mutation.predecessor = localMutationsRef.current.get(entry.predecessorId);
                if (entry.predecessorId && !mutation.predecessor && !entry.request) {
                    mutation.needsAttention = true;
                    mutation.status = "needs_attention";
                }
            }
            if (!latestMutationRef.current) latestMutationRef.current = [...localMutationsRef.current.values()]
                .filter(m => m.accountId === accountId && m.status !== "needs_attention")
                .sort((a,b) => a.sequence-b.sequence).at(-1);
            setJournalVersion(value => value + 1);
        } catch { setJournalError(true); }
    }, []);

    const recordLocalMutation = useCallback((
        scope: StorageScope,
        itemId: string,
        isBookmarked: boolean,
        progress: ReadingProgressData | null,
        guestImport?: LibraryGuestImport,
    ) => {
        const currentUser = userRef.current;
        if (!currentUser) return null;
        localMutationGenerationRef.current += 1;
        const mutation: LocalLibraryMutation = {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(), status: "pending", guestImport,
            accountId: currentUser.id,
            scope,
            itemId,
            sequence: ++mutationSequenceRef.current,
            sessionGeneration: authenticationGenerationRef.current,
            isBookmarked,
            progress,
            base: confirmedBoundaryRef.current,
            predecessor: latestMutationRef.current,
            needsAttention: syncBlockedRef.current,
        };
        latestMutationRef.current = mutation;
        localMutationsRef.current.set(mutation.id, mutation);
        try { persistMutation(mutation); } catch {
            mutation.needsAttention = true; mutation.status = "needs_attention";
            setJournalError(true);
            toast.error("This device could not keep your change. Review Library sync in Settings.");
        }
        return mutation.id;
    }, [persistMutation]);

    const readProgressFromScope = useCallback((scope: StorageScope, itemId: string) => {
        try {
            const stored = localStorage.getItem(progressKey(scope, itemId));
            return stored ? JSON.parse(stored) as ReadingProgressData : null;
        } catch {
            return null;
        }
    }, []);

    const acknowledgeMutation = useCallback((mutationId: string, acknowledgement: LibraryMutationAcknowledgement) => {
        const mutation = localMutationsRef.current.get(mutationId);
        if (!mutation) return;
        if (mutation.sessionGeneration !== authenticationGenerationRef.current || mutation.accountId !== userRef.current?.id) return;
        const next: LocalLibraryMutation = { ...mutation, acknowledgement, predecessor: undefined,
            status: acknowledgement.outcome === "skipped" && acknowledgement.reason !== "source_already_imported" ? "needs_attention" : "acknowledged" };
        next.needsAttention = next.status === "needs_attention";
        persistMutation(next);
        Object.assign(mutation, next);
        try {
            if (mutation.guestImport && (acknowledgement.outcome !== "skipped" || acknowledgement.reason === "source_already_imported")) {
                consumeGuestSource(localStorage, { itemId: mutation.itemId, isBookmarked: mutation.isBookmarked, progress: mutation.progress });
            }
            const prior = confirmedBoundaryRef.current;
            if (!prior || acknowledgement.resetEpoch > prior.resetEpoch
                || (acknowledgement.resetEpoch === prior.resetEpoch && acknowledgement.libraryRevision > prior.libraryRevision)) {
                confirmedBoundaryRef.current = acknowledgement;
                storeLibraryBoundary(localStorage, mutation.accountId, acknowledgement);
            }
            // A newer acknowledgement for the same item supersedes an older
            // confirmed overlay, unless an unresolved child still needs it.
            for (const older of localMutationsRef.current.values()) {
                if (older.id !== mutation.id && older.accountId === mutation.accountId && older.itemId === mutation.itemId
                    && older.status === "acknowledged" && older.sequence < mutation.sequence
                    && ![...localMutationsRef.current.values()].some(child => child.predecessor?.id === older.id && !child.request && !child.acknowledgement)) {
                    removeLibraryIntent(localStorage, older.accountId, older.id);
                    localMutationsRef.current.delete(older.id);
                }
            }
        } catch { setJournalError(true); }
    }, [persistMutation]);

    const resetState = useCallback(() => {
        setInProgressIds([]);
        setCompletedIds([]);
        setMyListIds([]);
        setProgressMap({});
        setIsLoaded(false);
        isLoadedRef.current = false;
    }, []);

    const loadProgress = useCallback((scope: StorageScope = scopeRef.current) => {
        if (typeof window === "undefined") return;

        const progressKeys = getScopedProgressKeys(localStorage, scope);
        const inProgress: { id: string; sortTimestamp: string }[] = [];
        const completed: { id: string; sortTimestamp: string }[] = [];
        const newProgressMap: Record<string, ReadingProgressData> = {};

        progressKeys.forEach((key) => {
            const itemId = parseProgressItemId(key, scope);
            if (!itemId) return;

            try {
                const data = JSON.parse(localStorage.getItem(key) || "{}") as ReadingProgressData;
                const entry = {
                    id: itemId,
                    sortTimestamp: data.isCompleted
                        ? data.completedAt || data.lastReadAt || ""
                        : data.lastReadAt || "",
                };

                newProgressMap[itemId] = data;

                if (data.isCompleted) {
                    if (isArchivedFromList(data, "completed")) {
                        return;
                    }

                    completed.push(entry);
                } else {
                    if (isArchivedFromList(data, "reading")) {
                        return;
                    }

                    inProgress.push(entry);
                }
            } catch {
                // Ignore malformed local entries.
            }
        });

        const sortByRecent = (a: { sortTimestamp: string }, b: { sortTimestamp: string }) => {
            if (!a.sortTimestamp) return 1;
            if (!b.sortTimestamp) return -1;
            return parseProgressTimestamp(b.sortTimestamp) - parseProgressTimestamp(a.sortTimestamp);
        };

        setStorageScope(scope);
        setInProgressIds(inProgress.sort(sortByRecent).map((entry) => entry.id));
        setCompletedIds(completed.sort(sortByRecent).map((entry) => entry.id));
        setProgressMap(newProgressMap);
        setMyListIds(readScopedMyList(localStorage, scope));
        setIsLoaded(true);
        isLoadedRef.current = true;
    }, []);

    const insertOrMoveToFront = useCallback((ids: string[], itemId: string) => {
        const filtered = ids.filter((id) => id !== itemId);
        return [itemId, ...filtered];
    }, []);

    const syncItemToCloud = useCallback(async (
        currentUser: User | null,
        scope: StorageScope,
        itemId: string,
        isBookmarked: boolean,
        progressData: ReadingProgressData | null,
        mutationId: string | null,
    ) => {
        if (!currentUser) return true;
        if (!mutationId) return true;

        const mutation = localMutationsRef.current.get(mutationId);
        if (!mutation) return false;
        const commit = async () => {
            const isCurrent = () => mutation.sessionGeneration === authenticationGenerationRef.current
                && currentUser.id === userRef.current?.id && scope === scopeRef.current;
            if (!isCurrent()) return false;
            const controller = new AbortController();
            activeWritesRef.current.add(controller);
            try {
                if (mutation.acknowledgement) return mutation.status === "acknowledged";
                if (mutation.predecessor && !mutation.predecessor.acknowledgement && !mutation.predecessor.needsAttention) return false;
                if (navigator.onLine === false) {
                    toast.info("Change pending. It will retry when you reconnect.");
                    return false;
                }
                const predecessorBoundary = mutation.predecessor?.acknowledgement;
                const base = predecessorBoundary && mutation.base
                    && predecessorBoundary.resetEpoch === mutation.base.resetEpoch
                    && predecessorBoundary.libraryRevision > mutation.base.libraryRevision
                    ? predecessorBoundary : mutation.base;
                if (mutation.needsAttention || (mutation.predecessor?.needsAttention && !mutation.predecessor.acknowledgement) || !base
                    || base.resetEpoch !== mutation.base?.resetEpoch
                    || base.resetEpoch !== confirmedBoundaryRef.current?.resetEpoch) throw new LibraryMutationConflictError();
                if (!mutation.request) {
                    mutation.request = { mutationId: mutation.id, createdAt: mutation.createdAt,
                        baseRevision: base.libraryRevision, resetEpoch: base.resetEpoch, contentId: itemId,
                        isBookmarked, progress: progressData, lastInteractedAt: mutation.createdAt,
                        deleteIfEmpty: !isBookmarked && progressData === null, guestImport: mutation.guestImport };
                }
                // Persist the final wire request before sending it. Lost responses
                // must never cause a retry with a new base, timestamp or ID.
                persistMutation(mutation);
                const data = await commitUserLibraryMutation({ ...mutation.request, expectedAccountId: mutation.accountId }, controller.signal);
                if (!isCurrent() || mutation.needsAttention || localMutationsRef.current.get(mutation.id) !== mutation) return false;
                acknowledgeMutation(mutationId, data);
                return data.outcome !== "skipped";
            } catch (error) {
                if (!isCurrent() || localMutationsRef.current.get(mutation.id) !== mutation) return false;
                const terminal = error instanceof LibraryMutationConflictError || error instanceof LibraryMutationReceiptError;
                mutation.needsAttention = terminal;
                mutation.reviewed = false;
                mutation.status = terminal ? "needs_attention" : "pending";
                try { persistMutation(mutation); } catch { setJournalError(true); }
                if (!isCurrent() || (mutation.base && confirmedBoundaryRef.current
                    && mutation.base.resetEpoch < confirmedBoundaryRef.current.resetEpoch)) return false;
                syncBlockedRef.current = terminal;
                setSyncNeedsAttention(terminal);
                toast.error(error instanceof LibraryMutationConflictError
                    ? "Your library changed. Refresh it and review your change before saving again."
                    : "This change is pending on this device. Retry it in Settings when connected.", {
                    id: "library-sync-attention", duration: Infinity,
                    action: { label: "Refresh library", onClick: () => refreshLibraryRef.current() },
                });
                logRecoverableCloudSync("Library change needs attention", error, { itemId, scope });
                return false;
            } finally { activeWritesRef.current.delete(controller); }
        };
        const result = mutationTailRef.current.then(commit, commit);
        mutationTailRef.current = result;
        return result;
    }, [acknowledgeMutation, persistMutation]);

    const retryPending = useCallback(async () => {
        const currentUser = userRef.current;
        if (!currentUser || navigator.onLine === false) return;
        restoreJournal(currentUser.id);
        const entries = [...localMutationsRef.current.values()]
            .filter(mutation => mutation.accountId === currentUser.id && mutation.status === "pending")
            .sort((a, b) => a.sequence - b.sequence);
        for (const mutation of entries) {
            if (userRef.current?.id !== currentUser.id) break;
            await syncItemToCloud(currentUser, scopeRef.current, mutation.itemId, mutation.isBookmarked, mutation.progress, mutation.id);
        }
    }, [restoreJournal, syncItemToCloud]);
    retryPendingRef.current = retryPending;

    useEffect(() => {
        const online = () => { void retryPending(); };
        const changed = (event: StorageEvent) => {
            if (userRef.current && event.key?.startsWith(LIBRARY_JOURNAL_PREFIX)) {
                restoreJournal(userRef.current.id);
            }
        };
        window.addEventListener("online", online);
        window.addEventListener("storage", changed);
        return () => { window.removeEventListener("online", online); window.removeEventListener("storage", changed); };
    }, [retryPending, restoreJournal]);

    const discardIntent = useCallback((id: string) => {
        const mutation = localMutationsRef.current.get(id);
        if (!mutation || mutation.accountId !== userRef.current?.id || mutation.status !== "needs_attention") return;
        if (mutation.guestImport) releaseGuestBinding(localStorage, mutation.itemId, mutation.accountId, mutation.guestImport.sourceRecordId);
        removeLibraryIntent(localStorage, mutation.accountId, id);
        localMutationsRef.current.delete(id);
        setJournalVersion(value => value + 1);
        refreshLibraryRef.current();
    }, []);

    const retryJournalStorage = useCallback(() => {
        try {
            for (const mutation of localMutationsRef.current.values()) {
                if (mutation.accountId === userRef.current?.id) persistMutation(mutation);
            }
            const unreadable = userRef.current ? readLibraryIntents(localStorage, userRef.current.id).unreadableKeys.length : 0;
            setJournalError(unreadable > 0);
        } catch { setJournalError(true); }
    }, [persistMutation]);

    const discardUnreadableIntents = useCallback(() => {
        if (!userRef.current) return;
        try {
            readLibraryIntents(localStorage, userRef.current.id).unreadableKeys.forEach(key => localStorage.removeItem(key));
            setJournalError(false);
        } catch { setJournalError(true); }
    }, []);

    const importGuestLibrary = useCallback(async () => {
        const currentUser = userRef.current;
        if (!currentUser || !confirmedBoundaryRef.current) return;
        try {
            const migrationId = crypto.randomUUID();
            const assignedItems = new Set([...localMutationsRef.current.values()].filter(mutation => mutation.guestImport).map(mutation => mutation.itemId));
            const sources = guestLibrarySources(localStorage).filter(source => !assignedItems.has(source.itemId)).slice(0, 200);
            for (const source of sources) {
                if (userRef.current?.id !== currentUser.id) break;
                const guestImport = bindGuestSource(localStorage, source, currentUser.id, migrationId);
                const alreadyQueued = [...localMutationsRef.current.values()].some(mutation => mutation.guestImport?.sourceRecordId === guestImport.sourceRecordId);
                if (alreadyQueued) continue;
                recordLocalMutation(scopeRef.current, source.itemId, source.isBookmarked, source.progress, guestImport);
            }
            await retryPending();
            // An uncertain write must keep its frozen request. Starting another
            // snapshot here races a reload and does not resolve that outcome.
            const stillPending = [...localMutationsRef.current.values()].some(mutation => mutation.accountId === currentUser.id && mutation.status === "pending");
            if (!stillPending) refreshLibraryRef.current();
        } catch (error) {
            setJournalError(true);
            toast.error(error instanceof Error ? error.message : "Guest import needs review.");
        }
    }, [recordLocalMutation, retryPending]);

    const hydrateCloudSnapshot = useCallback(async (
        currentUser: User,
        scope: StorageScope,
        runId: number,
        mutationGeneration: number,
    ) => {
        const snapshot = await fetchCompleteLibrarySnapshot(getLibrarySnapshotIdempotencyKey(currentUser.id));

        // Do not install a response from an earlier sign-in session or let an
        // older complete snapshot overwrite a local mutation made while it was
        // loading. A later hydration run reconciles canonical server state.
        if (
            runId !== hydrateRunRef.current
            || userRef.current?.id !== currentUser.id
            || scopeRef.current !== scope
            || localMutationGenerationRef.current !== mutationGeneration
        ) {
            return false;
        }

        const installed = installedSnapshotStateRef.current.get(scope);
        if (installed && snapshot.manifest.resetEpoch < installed.resetEpoch) {
            throw new Error("Refusing to install a snapshot from before the local reset epoch.");
        }

        let superseded = false;
        for (const mutation of localMutationsRef.current.values()) {
            if (mutation.scope === scope && mutation.base && mutation.base.resetEpoch < snapshot.manifest.resetEpoch) {
                mutation.needsAttention = true;
                mutation.status = "needs_attention";
                persistMutation(mutation);
                superseded = true;
            }
        }
        if (superseded) {
            latestMutationRef.current = undefined;
            mutationTailRef.current = Promise.resolve();
        }
        const scopedMutations = [...localMutationsRef.current.values()]
            .filter((mutation) => mutation.scope === scope
                && mutation.accountId === currentUser.id
                && mutation.sessionGeneration === authenticationGenerationRef.current
                && !mutation.needsAttention)
            .sort((left, right) => left.sequence - right.sequence);
        const isAcknowledgementIncluded = (mutation: LocalLibraryMutation) => {
            const acknowledgement = mutation.acknowledgement;
            if (!acknowledgement) return false;
            if (snapshot.manifest.resetEpoch < acknowledgement.resetEpoch) {
                throw new Error("Refusing to install a snapshot from before an acknowledged reset epoch.");
            }
            return snapshot.manifest.resetEpoch > acknowledgement.resetEpoch
                || snapshot.manifest.boundaryLibraryRevision >= acknowledgement.libraryRevision;
        };
        const mutations = scopedMutations.flatMap((mutation) => {
                const acknowledgement = mutation.acknowledgement;
                if (!acknowledgement) return [mutation];

                const acknowledgementIncluded = isAcknowledgementIncluded(mutation);
                if (!acknowledgementIncluded) return [mutation];

                // Do not let a delayed acknowledgement for an older mutation
                // resurrect state after a newer action is already confirmed by
                // this snapshot. Keep the newer overlay until every earlier
                // action for that item is settled (or it is explicitly
                // superseded by another confirmed action).
                const hasEarlierUnsettledMutation = scopedMutations.some((candidate) => (
                    candidate.itemId === mutation.itemId
                    && candidate.sequence < mutation.sequence
                    && !isAcknowledgementIncluded(candidate)
                ));
                if (hasEarlierUnsettledMutation) return [mutation];

                const neededByPending = scopedMutations.some(candidate => candidate.predecessor?.id === mutation.id && !candidate.request && !candidate.acknowledgement);
                if (!neededByPending) {
                    removeLibraryIntent(localStorage, mutation.accountId, mutation.id);
                    localMutationsRef.current.delete(mutation.id);
                }
                return [];
            });
        clearScopedProgress(localStorage, scope);
        const bookmarkedIds: string[] = [];
        for (const row of snapshot.records) {
            if (row.is_bookmarked) bookmarkedIds.push(row.content_id);
            if (hasProgressData(row.progress as ReadingProgressData | null)) {
                localStorage.setItem(progressKey(scope, row.content_id), JSON.stringify(row.progress));
            }
        }
        // Apply every local mutation in creation order. This makes a newer
        // pending removal win over an older acknowledged save for the same
        // item, even when the server responses arrive in the opposite order.
        for (const mutation of mutations) {
            const index = bookmarkedIds.indexOf(mutation.itemId);
            if (mutation.isBookmarked && index === -1) bookmarkedIds.push(mutation.itemId);
            if (!mutation.isBookmarked && index !== -1) bookmarkedIds.splice(index, 1);
            if (mutation.progress) localStorage.setItem(progressKey(scope, mutation.itemId), JSON.stringify(mutation.progress));
            else localStorage.removeItem(progressKey(scope, mutation.itemId));
        }
        writeScopedMyList(localStorage, scope, bookmarkedIds);
        installedSnapshotStateRef.current.set(scope, {
            resetEpoch: snapshot.manifest.resetEpoch,
            boundaryRevision: snapshot.manifest.boundaryLibraryRevision,
        });
        const boundary = { resetEpoch: snapshot.manifest.resetEpoch, libraryRevision: snapshot.manifest.boundaryLibraryRevision };
        const confirmed = confirmedBoundaryRef.current;
        if (!confirmed || boundary.resetEpoch > confirmed.resetEpoch
            || (boundary.resetEpoch === confirmed.resetEpoch && boundary.libraryRevision >= confirmed.libraryRevision)) {
            confirmedBoundaryRef.current = boundary;
            storeLibraryBoundary(localStorage, currentUser.id, boundary);
        }
        if (syncBlockedRef.current) {
            // Refresh shows canonical data; rejected intents stay in the durable
            // journal for explicit review, never silently resubmitted.
            syncBlockedRef.current = false;
            setSyncNeedsAttention(false);
            latestMutationRef.current = undefined;
            toast.dismiss("library-sync-attention");
        }
        for (const mutation of localMutationsRef.current.values()) {
            if (mutation.accountId === currentUser.id && mutation.needsAttention) mutation.reviewed = true;
        }
        clearLibrarySnapshotIdempotencyKey(currentUser.id);
        setJournalVersion(value => value + 1);
        return true;
    }, [persistMutation]);

    const hydrateForUser = useCallback(async (nextUser: User | null, force = false) => {
        if (typeof window === "undefined") return;

        const nextScope = getStorageScope(nextUser?.id);
        const currentUserId = userRef.current?.id ?? null;
        const nextUserId = nextUser?.id ?? null;

        if (currentUserId !== nextUserId) {
            activeWritesRef.current.forEach(controller => controller.abort());
            authenticationGenerationRef.current += 1;
            localMutationsRef.current.clear();
            confirmedBoundaryRef.current = undefined;
            latestMutationRef.current = undefined;
            mutationTailRef.current = Promise.resolve();
            syncBlockedRef.current = false;
            setSyncNeedsAttention(false);
            toast.dismiss("library-sync-attention");
        }

        if (!didRunLegacyMigrationRef.current) {
            migrateLegacyStorageToGuest(localStorage);
            didRunLegacyMigrationRef.current = true;
        }

        if (
            isLoadedRef.current
            && scopeRef.current === nextScope
            && currentUserId === nextUserId
            && !force
        ) {
            return;
        }

        const runId = ++hydrateRunRef.current;
        resetState();

        userRef.current = nextUser;
        scopeRef.current = nextScope;
        setUser(nextUser);
        setStorageScope(nextScope);

        if (nextUser) {
            if (!confirmedBoundaryRef.current) confirmedBoundaryRef.current = readLibraryBoundary(localStorage, nextUser.id);
            restoreJournal(nextUser.id);
        }
        loadProgress(nextScope);

        if (!nextUser) {
            setHydrationStatus("ready");
            return;
        }

        const mutationGeneration = localMutationGenerationRef.current;
        setHydrationStatus("hydrating");
        void hydrateCloudSnapshot(nextUser, nextScope, runId, mutationGeneration)
            .then((syncSucceeded) => {
                if (runId !== hydrateRunRef.current) return;

                if (syncSucceeded) {
                    loadProgress(nextScope);
                    setHydrationStatus("ready");
                    void retryPendingRef.current();
                    return;
                }

                if (
                    userRef.current?.id === nextUser.id
                    && localMutationGenerationRef.current !== mutationGeneration
                ) {
                    window.setTimeout(() => void hydrateForUser(nextUser, true), 0);
                }
            })
            .catch((error) => {
                // A terminal operation outcome is durable by design. Retrying
                // it with the same key would only retrieve that same outcome;
                // discard the key so an explicit retry starts a fresh request.
                if (error instanceof LibrarySnapshotClientError && terminalSnapshotOutcomeCodes.has(error.code)) {
                    clearLibrarySnapshotIdempotencyKey(nextUser.id);
                }
                if (runId === hydrateRunRef.current) setHydrationStatus("error");
                logRecoverableCloudSync("Fetch complete library snapshot failed", error, {
                    scope: nextScope,
                    userId: nextUser.id,
                });
            });
    }, [hydrateCloudSnapshot, loadProgress, resetState, restoreJournal]);

    refreshLibraryRef.current = () => {
        if (userRef.current) clearLibrarySnapshotIdempotencyKey(userRef.current.id);
        void hydrateForUser(userRef.current, true);
    };

    useEffect(() => {
        void hydrateForUser(initialUser ?? null);
    }, [hydrateForUser, initialUser]);

    useEffect(() => {
        const activeWrites = activeWritesRef.current;
        return () => {
            // A same-account auth refresh must not invalidate in-flight hydration.
            // Account changes are invalidated by hydrateForUser; only unmount
            // cancels here. Clear readiness so Strict Mode can restart setup.
            hydrateRunRef.current += 1;
            isLoadedRef.current = false;
            activeWrites.forEach(controller => controller.abort());
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleStorage = (event: StorageEvent) => {
            if (isScopeStorageEventKey(event.key, scopeRef.current)) {
                loadProgress(scopeRef.current);
            }
        };

        const handleCustomUpdate = () => {
            loadProgress(scopeRef.current);
        };

        window.addEventListener("storage", handleStorage);
        window.addEventListener("netflux_progress_updated", handleCustomUpdate);

        return () => {
            window.removeEventListener("storage", handleStorage);
            window.removeEventListener("netflux_progress_updated", handleCustomUpdate);
        };
    }, [loadProgress]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleLibraryReset = (event: Event) => {
            const detail = (event as CustomEvent<{
                scope?: StorageScope;
                resetEpoch?: number | null;
                boundaryRevision?: number | null;
            }>).detail;
            if (!detail || detail.scope !== scopeRef.current) return;

            // Cancel any traversal that began before the acknowledged reset.
            // The next authenticated hydration obtains the new epoch instead.
            hydrateRunRef.current += 1;
            const prior = installedSnapshotStateRef.current.get(detail.scope);
            installedSnapshotStateRef.current.set(detail.scope, {
                resetEpoch: detail.resetEpoch ?? (prior?.resetEpoch ?? 0) + 1,
                boundaryRevision: detail.boundaryRevision ?? prior?.boundaryRevision ?? 0,
            });
            confirmedBoundaryRef.current = {
                resetEpoch: detail.resetEpoch ?? (prior?.resetEpoch ?? 0) + 1,
                libraryRevision: detail.boundaryRevision ?? prior?.boundaryRevision ?? 0,
            };
            for (const mutation of localMutationsRef.current.values()) {
                if (mutation.scope === detail.scope) {
                    mutation.needsAttention = true;
                    if (mutation.guestImport) consumeGuestSource(localStorage, { itemId: mutation.itemId, isBookmarked: mutation.isBookmarked, progress: mutation.progress });
                    localMutationsRef.current.delete(mutation.id);
                }
            }
            latestMutationRef.current = undefined;
            mutationTailRef.current = Promise.resolve();
            syncBlockedRef.current = false;
            setSyncNeedsAttention(false);
            if (userRef.current) {
                clearLibraryIntents(localStorage, userRef.current.id);
                storeLibraryBoundary(localStorage, userRef.current.id, confirmedBoundaryRef.current!);
            }
            activeWritesRef.current.forEach(controller => controller.abort());
            setJournalVersion(value => value + 1);
            toast.dismiss("library-sync-attention");
            setHydrationStatus("ready");
        };

        window.addEventListener("netflux_library_reset", handleLibraryReset);
        return () => window.removeEventListener("netflux_library_reset", handleLibraryReset);
    }, []);

    const removeFromProgress = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        localStorage.removeItem(progressKey(scope, itemId));

        setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        setProgressMap((prev) => {
            const next = { ...prev };
            delete next[itemId];
            return next;
        });

        if (userRef.current) {
            const isBookmarked = readScopedMyList(localStorage, scope).includes(itemId);
            const mutationId = recordLocalMutation(scope, itemId, isBookmarked, null);
            syncItemToCloud(userRef.current, scope, itemId, isBookmarked, null, mutationId);
        }

        window.dispatchEvent(new Event("netflux_progress_updated"));
    }, [recordLocalMutation, syncItemToCloud]);

    const clearRecommendationMemory = useCallback((scope: StorageScope) => {
        if (typeof window === "undefined") return;

        clearRecentRecommendations(localStorage, scope);
        clearCachedRecommendations(localStorage, scope);
        clearCachedBrowseRecommendations(localStorage, scope);
    }, []);

    const removeFromHistory = useCallback(async (
        itemId: string,
        options?: { deleteNotesAndHighlights?: boolean },
    ) => {
        if (typeof window === "undefined") return false;

        const scope = scopeRef.current;
        localStorage.removeItem(progressKey(scope, itemId));
        clearRecommendationMemory(scope);

        setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        setProgressMap((prev) => {
            const next = { ...prev };
            delete next[itemId];
            return next;
        });

        const currentUser = userRef.current;
        const cloudSync = currentUser
            ? (() => {
                const isBookmarked = readScopedMyList(localStorage, scope).includes(itemId);
                return syncItemToCloud(currentUser, scope, itemId, isBookmarked, null,
                    recordLocalMutation(scope, itemId, isBookmarked, null));
            })()
            : Promise.resolve(true);
        const activitySync = currentUser
            ? fetch(`/api/activity/history/content/${itemId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deleteNotesAndHighlights: options?.deleteNotesAndHighlights === true,
                }),
            })
                .then((response) => response.ok)
                .catch(() => false)
            : Promise.resolve(true);

        const [didSyncCloud, didSyncActivity] = await Promise.all([cloudSync, activitySync]);

        if (options?.deleteNotesAndHighlights) {
            await queryClient.invalidateQueries({ queryKey: ["highlights"] });
        }

        window.dispatchEvent(new Event("netflux_progress_updated"));
        window.dispatchEvent(new Event("netflux_activity_history_updated"));

        return didSyncCloud && didSyncActivity;
    }, [clearRecommendationMemory, queryClient, recordLocalMutation, syncItemToCloud]);

    const archiveFromProgressList = useCallback((itemId: string, list: ProgressLibraryList) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentProgress = readProgressFromScope(scope, itemId);
        if (!currentProgress) return;

        const nextProgress: ReadingProgressData = {
            ...currentProgress,
            archivedFromLists: {
                ...(currentProgress.archivedFromLists ?? {}),
                [list]: true,
            },
        };

        localStorage.setItem(progressKey(scope, itemId), JSON.stringify(nextProgress));
        setProgressMap((prev) => ({ ...prev, [itemId]: nextProgress }));

        if (list === "completed") {
            setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        } else {
            setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        }

        const isBookmarked = readScopedMyList(localStorage, scope).includes(itemId);
        syncItemToCloud(userRef.current, scope, itemId, isBookmarked, nextProgress,
            recordLocalMutation(scope, itemId, isBookmarked, nextProgress));
        window.dispatchEvent(new Event("netflux_progress_updated"));
    }, [readProgressFromScope, recordLocalMutation, syncItemToCloud]);

    const restoreProgressListArchive = useCallback((itemId: string, list: ProgressLibraryList) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentProgress = readProgressFromScope(scope, itemId);
        if (!currentProgress) return;

        const nextProgress = clearArchiveForList(currentProgress, list);
        localStorage.setItem(progressKey(scope, itemId), JSON.stringify(nextProgress));
        setProgressMap((prev) => ({ ...prev, [itemId]: nextProgress }));

        const currentList = getProgressLibraryList(nextProgress);
        if (currentList === "completed") {
            setCompletedIds((prev) => insertOrMoveToFront(prev, itemId));
            setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        } else {
            setInProgressIds((prev) => insertOrMoveToFront(prev, itemId));
            setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        }

        const isBookmarked = readScopedMyList(localStorage, scope).includes(itemId);
        syncItemToCloud(userRef.current, scope, itemId, isBookmarked, nextProgress,
            recordLocalMutation(scope, itemId, isBookmarked, nextProgress));
        window.dispatchEvent(new Event("netflux_progress_updated"));
    }, [insertOrMoveToFront, readProgressFromScope, recordLocalMutation, syncItemToCloud]);

    const addToMyList = useCallback(async (itemId: string) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentList = readScopedMyList(localStorage, scope);
        if (currentList.includes(itemId)) return false;

        const newList = [itemId, ...currentList];
        writeScopedMyList(localStorage, scope, newList);
        setMyListIds(newList);

        const progress = readProgressFromScope(scope, itemId);
        const mutationId = recordLocalMutation(scope, itemId, true, progress);

        const synced = syncItemToCloud(userRef.current, scope, itemId, true, progress, mutationId)
            .then((didSync) => {
                if (!didSync) return false;

                captureAnalyticsEvent("library_saved", {
                    content_id: itemId,
                    route: "useReadingProgress.addToMyList",
                    save_state: "saved",
                    user_state: userRef.current ? "authenticated" : "anonymous",
                });
                return true;
            });
        window.dispatchEvent(new Event("netflux_progress_updated"));
        return synced;
    }, [readProgressFromScope, recordLocalMutation, syncItemToCloud]);

    const removeFromMyList = useCallback(async (itemId: string) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentList = readScopedMyList(localStorage, scope);
        const newList = currentList.filter((id) => id !== itemId);

        writeScopedMyList(localStorage, scope, newList);
        setMyListIds(newList);

        const progress = readProgressFromScope(scope, itemId);
        const synced = syncItemToCloud(userRef.current, scope, itemId, false, progress,
            recordLocalMutation(scope, itemId, false, progress));
        window.dispatchEvent(new Event("netflux_progress_updated"));
        return synced;
    }, [readProgressFromScope, recordLocalMutation, syncItemToCloud]);

    const toggleMyList = useCallback((itemId: string) => {
        if (readScopedMyList(localStorage, scopeRef.current).includes(itemId)) {
            return removeFromMyList(itemId);
        }

        return addToMyList(itemId);
    }, [addToMyList, removeFromMyList]);

    const saveReadingProgress = useCallback((itemId: string, data: ReadingProgressData) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentProgress = readProgressFromScope(scope, itemId);
        const nextProgressData: ReadingProgressData = data.isCompleted
            ? {
                ...data,
                completedAt: currentProgress?.isCompleted && currentProgress.completedAt
                    ? currentProgress.completedAt
                    : data.completedAt || data.lastReadAt || new Date().toISOString(),
            }
            : (() => {
                const inProgressData = { ...data };
                delete inProgressData.completedAt;
                return inProgressData;
            })();
        const nextData = clearArchiveForCurrentList(nextProgressData);
        localStorage.setItem(progressKey(scope, itemId), JSON.stringify(nextData));

        setProgressMap((prev) => ({ ...prev, [itemId]: nextData }));

        if (nextData.isCompleted) {
            setCompletedIds((prev) => insertOrMoveToFront(prev, itemId));
            setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        } else {
            setInProgressIds((prev) => insertOrMoveToFront(prev, itemId));
            setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        }

        const isBookmarked = readScopedMyList(localStorage, scope).includes(itemId);
        void syncItemToCloud(userRef.current, scope, itemId, isBookmarked, nextData,
            recordLocalMutation(scope, itemId, isBookmarked, nextData))
            .then((didSync) => {
                if (!didSync || !nextData.isCompleted || currentProgress?.isCompleted) {
                    return;
                }

                captureAnalyticsEvent("content_completed", {
                    content_id: itemId,
                    route: "useReadingProgress.saveReadingProgress",
                    completion_percent: 100,
                    user_state: userRef.current ? "authenticated" : "anonymous",
                });
            });
        window.dispatchEvent(new Event("netflux_progress_updated"));
    }, [insertOrMoveToFront, readProgressFromScope, recordLocalMutation, syncItemToCloud]);

    const reapplyIntent = useCallback(async (id: string) => {
        const mutation = localMutationsRef.current.get(id);
        if (!mutation || mutation.accountId !== userRef.current?.id || mutation.status !== "needs_attention"
            || !mutation.reviewed || hydrationStatus !== "ready" || !confirmedBoundaryRef.current) return;
        // Explicit review is a NEW action; the rejected request is never mutated.
        latestMutationRef.current = undefined;
        syncBlockedRef.current = false;
        const replacement = recordLocalMutation(scopeRef.current, mutation.itemId, mutation.isBookmarked, mutation.progress, mutation.guestImport);
        if (!replacement) return;
        removeLibraryIntent(localStorage, mutation.accountId, id);
        localMutationsRef.current.delete(id);
        await syncItemToCloud(userRef.current, scopeRef.current, mutation.itemId, mutation.isBookmarked, mutation.progress, replacement);
        refreshLibraryRef.current();
    }, [hydrationStatus, recordLocalMutation, syncItemToCloud]);

    const recovery = useMemo(() => {
        void journalVersion; // Recompute when the mutable journal changes.
        const entries = [...localMutationsRef.current.values()].filter(mutation => mutation.accountId === user?.id && mutation.status !== "acknowledged");
        let guestCount = 0;
        let importableGuestCount = 0;
        try {
            const sources = guestLibrarySources(localStorage);
            guestCount = sources.length;
            const assignedItems = new Set([...localMutationsRef.current.values()].filter(mutation => mutation.accountId === user?.id && mutation.guestImport).map(mutation => mutation.itemId));
            importableGuestCount = sources.filter(source => !assignedItems.has(source.itemId)).length;
        } catch { /* The explicit import reports corrupt sources. */ }
        return { pending: entries.filter(mutation => mutation.status === "pending").length,
            attention: entries.filter(mutation => mutation.status === "needs_attention").map(mutation => ({
                id: mutation.id, itemId: mutation.itemId, isBookmarked: mutation.isBookmarked,
                createdAt: mutation.createdAt, canReapply: Boolean(mutation.reviewed) && hydrationStatus === "ready" && !(mutation.guestImport && mutation.acknowledgement?.outcome === "skipped"), guest: Boolean(mutation.guestImport), skipped: mutation.acknowledgement?.outcome === "skipped",
            })), guestCount, importableGuestCount, storageError: journalError };
    }, [journalVersion, journalError, user, hydrationStatus]);

    const isInMyList = useCallback((itemId: string) => myListIds.includes(itemId), [myListIds]);
    const getProgress = useCallback((itemId: string) => progressMap[itemId] || null, [progressMap]);
    const totalLibraryItems = inProgressIds.length + completedIds.length + myListIds.length;

    const refresh = useCallback(() => loadProgress(scopeRef.current), [loadProgress]);
    const retryHydration = useCallback(() => void hydrateForUser(userRef.current, true), [hydrateForUser]);

    return useMemo(() => ({
        inProgressIds,
        completedIds,
        inProgressCount: inProgressIds.length,
        completedCount: completedIds.length,
        isLoaded: isLoaded && (!user || hydrationStatus !== "hydrating"),
        hydrationStatus,
        syncNeedsAttention,
        recovery, retryPending, discardIntent, reapplyIntent, importGuestLibrary, retryJournalStorage, discardUnreadableIntents,
        refresh,
        retryHydration,
        archiveFromProgressList,
        restoreProgressListArchive,
        removeFromProgress,
        removeFromHistory,
        saveReadingProgress,
        getProgress,
        myListIds,
        myListCount: myListIds.length,
        addToMyList,
        removeFromMyList,
        toggleMyList,
        isInMyList,
        totalLibraryItems,
        storageScope,
        user,
    }), [inProgressIds, completedIds, isLoaded, hydrationStatus, syncNeedsAttention, recovery, retryPending, discardIntent, reapplyIntent, importGuestLibrary, retryJournalStorage, discardUnreadableIntents, refresh, retryHydration, archiveFromProgressList,
        restoreProgressListArchive, removeFromProgress, removeFromHistory, saveReadingProgress,
        getProgress, myListIds, addToMyList, removeFromMyList, toggleMyList, isInMyList,
        totalLibraryItems, storageScope, user]);
}

type ReadingProgressValue = ReturnType<typeof useReadingProgressController>;

const ReadingProgressContext = createContext<ReadingProgressValue | undefined>(undefined);

export function ReadingProgressProvider({
    children,
}: {
    children: ReactNode;
}) {
    const user = useAuthUser();
    const value = useReadingProgressController(user);

    return createElement(ReadingProgressContext.Provider, { value }, children);
}

export function useReadingProgress() {
    const value = useContext(ReadingProgressContext);

    if (value === undefined) {
        throw new Error("useReadingProgress must be used within a ReadingProgressProvider");
    }

    return value;
}
