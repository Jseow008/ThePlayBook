import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_DATA_EXPORT_COLLECTIONS } from "@/lib/account-data-snapshot-collections";
import { AccountDataExportError, fetchVerifiedAccountDataExport } from "@/lib/account-data-export-client";

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

function hash(value: unknown) {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function hashText(value: string) {
    return createHash("sha256").update(value).digest("hex");
}

function response(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function fixture() {
    const snapshotId = "00000000-0000-4000-8000-000000000001";
    const collectionRecords = Object.fromEntries(ACCOUNT_DATA_EXPORT_COLLECTIONS.map((collection, index) => {
        const payload = collection === "reflections"
            ? { id: `${collection}-1`, reflection_text: "The required reflection." }
            : { id: `${collection}-1`, value: index + 1 };
        const record = collection === "user_library"
            ? { ordinal: 1, content_id: "user_library-1", is_bookmarked: true, payloadHash: hash({ content_id: "user_library-1", is_bookmarked: true }) }
            : { ordinal: 1, recordId: `${collection}-1`, payload, payloadHash: hash(payload) };
        const recordHash = record.payloadHash;
        return [collection, [record, recordHash]];
    })) as Record<string, [{ ordinal: number; payloadHash: string; [key: string]: unknown }, string]>;
    const collectionManifests = Object.fromEntries(ACCOUNT_DATA_EXPORT_COLLECTIONS.map((collection) => [collection, {
        recordCount: 1,
        manifestHash: hashText(collectionRecords[collection][1]),
    }]));
    const manifest = {
        snapshotId,
        recordCount: ACCOUNT_DATA_EXPORT_COLLECTIONS.length,
        manifestHash: hashText(ACCOUNT_DATA_EXPORT_COLLECTIONS.map((collection) => collectionRecords[collection][1]).join("\n")),
        resetEpoch: 0,
        boundaryLibraryRevision: 1,
        expiresAt: "2030-01-01T00:00:00.000Z",
        schemaVersion: 2,
        collectionManifests,
    };
    return { manifest, collectionRecords };
}

describe("verified account-data export", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("downloads every allowlisted collection, including reflections, only after verification", async () => {
        const { manifest, collectionRecords } = fixture();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response({ state: "ready", manifest }, 201));
        for (const collection of ACCOUNT_DATA_EXPORT_COLLECTIONS) {
            fetchMock.mockResolvedValueOnce(response({
                data: [collectionRecords[collection][0]],
                manifest,
                pageInfo: { hasNextPage: false, endCursor: null },
            }));
        }
        vi.stubGlobal("fetch", fetchMock);

        const result = await fetchVerifiedAccountDataExport();

        expect(fetchMock).toHaveBeenCalledTimes(ACCOUNT_DATA_EXPORT_COLLECTIONS.length + 1);
        expect(result.data.reflections).toEqual([{ id: "reflections-1", reflection_text: "The required reflection." }]);
        expect(Object.keys(result.data).sort()).toEqual([...ACCOUNT_DATA_EXPORT_COLLECTIONS].sort());
    });

    it("rejects a record whose received field value no longer matches its hash", async () => {
        const { manifest, collectionRecords } = fixture();
        const fetchMock = vi.fn().mockResolvedValueOnce(response({ state: "ready", manifest }, 201));
        for (const collection of ACCOUNT_DATA_EXPORT_COLLECTIONS) {
            const record = collectionRecords[collection][0];
            fetchMock.mockResolvedValueOnce(response({
                data: [collection === "reflections" ? { ...record, payload: { id: "reflections-1", reflection_text: "altered" } } : record],
                manifest,
                pageInfo: { hasNextPage: false, endCursor: null },
            }));
        }
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchVerifiedAccountDataExport()).rejects.toBeInstanceOf(AccountDataExportError);
    });
});
