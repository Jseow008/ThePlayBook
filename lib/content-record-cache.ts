import type { QueryClient } from "@tanstack/react-query";
import type { ContentItem } from "@/types/database";

const MAX_AGE = 60_000;
const versions = new WeakMap<QueryClient, number>();
const key = (id: string) => ["content-record", id] as const;
type RecordEntry = { item: ContentItem | null; expiresAt: number; version: number };
export type ContentBatchData = { ids: string[]; items: ContentItem[]; expiresAt: number };

export function cachedContentBatch(client: QueryClient, ids: string[]): ContentBatchData | undefined {
    const records = ids.map(id => client.getQueryData<RecordEntry>(key(id)));
    if (records.some((record, index) => !record || record.expiresAt <= Date.now() || client.getQueryState(key(ids[index]))?.isInvalidated)) return undefined;
    return { ids, items: records.flatMap(record => record?.item ? [record.item] : []), expiresAt: Math.min(...records.map(record => record!.expiresAt)) };
}

export function invalidateContentRecords(client: QueryClient, ids: string[]) {
    for (const id of ids) void client.invalidateQueries({ queryKey: key(id), exact: true, refetchType: "none" });
}

export async function fetchContentBatch(client: QueryClient, ids: string[], signal: AbortSignal, force = false): Promise<ContentBatchData> {
    const needed = ids.filter(id => force || !cachedContentBatch(client, [id]));
    if (needed.length) {
        const version = (versions.get(client) ?? 0) + 1;
        versions.set(client, version);
        const chunks: string[][] = [];
        for (let i = 0; i < needed.length; i += 50) chunks.push(needed.slice(i, i + 50));
        const results = await Promise.all(chunks.map(async chunk => {
            const startedAt = Date.now();
            const response = await fetch("/api/content/batch", { signal, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: chunk }) });
            if (!response.ok) throw new Error("Failed to fetch content batch");
            const remaining = response.headers?.get("X-Content-Fresh-For");
            const ttl = remaining !== null && remaining !== undefined && Number.isFinite(Number(remaining))
                ? Math.max(0, Math.min(MAX_AGE, Number(remaining))) : MAX_AGE;
            return { items: await response.json() as ContentItem[], expiresAt: startedAt + ttl };
        }));
        signal.throwIfAborted();
        const byId = new Map(results.flatMap(result => result.items).filter(item => needed.includes(item.id)).map(item => [item.id, item]));
        // Share the server's remaining lifetime, conservatively subtracting the
        // request round trip instead of adding another browser cache window.
        const expiresAt = Math.min(...results.map(result => result.expiresAt));
        const accepted = new Set<string>();
        for (const id of needed) {
            const prior = client.getQueryData<RecordEntry>(key(id));
            if (prior && prior.version > version) continue;
            client.setQueryData<RecordEntry>(key(id), { item: byId.get(id) ?? null, expiresAt, version });
            accepted.add(id);
        }
        // Keep already-mounted/cached lists coherent after a refresh, including
        // authoritative removal or a previously missing item being published.
        client.setQueriesData<ContentBatchData>({ queryKey: ["content-batch"] }, old => {
            if (!old?.ids.some(id => accepted.has(id))) return old;
            const oldItems = new Map(old.items.map(item => [item.id, item]));
            for (const id of old.ids) if (accepted.has(id)) {
                const item = client.getQueryData<RecordEntry>(key(id))?.item;
                if (item) oldItems.set(id, item); else oldItems.delete(id);
            }
            return { ...old, items: old.ids.flatMap(id => oldItems.has(id) ? [oldItems.get(id)!] : []), expiresAt: Math.min(old.expiresAt, expiresAt) };
        });
    }
    const records = ids.map(id => client.getQueryData<RecordEntry>(key(id)));
    return { ids, items: records.flatMap(record => record?.item ? [record.item] : []), expiresAt: Math.min(...records.map(record => record?.expiresAt ?? 0)) };
}
