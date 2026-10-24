import { describe, expect, it } from "vitest";
import baseline from "@/tests/fixtures/validation/zod3-contract.json";
import { contractResult, zodContractCases } from "@/tests/helpers/zod-contract-cases";
import { readLibraryBoundary, storeLibraryBoundary } from "@/lib/library-mutation-journal";

// Deliberate security tightening: neither value is a supported database/API value.
const tightened = new Set(["query/7", "counter/5"]);
describe("Zod migration validation contracts", () => {
    it("retains valid saved boundaries and rejects an unsafe persisted counter", () => {
        const owner = "synthetic-zod-migration";
        const values = new Map<string, string>();
        const storage: Storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
            removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: index => [...values.keys()][index] ?? null,
            get length() { return values.size; } };
        storeLibraryBoundary(storage, owner, { resetEpoch: 1, libraryRevision: Number.MAX_SAFE_INTEGER });
        expect(readLibraryBoundary(storage, owner)).toEqual({ resetEpoch: 1, libraryRevision: Number.MAX_SAFE_INTEGER });
        const unsafe = { resetEpoch: 1, libraryRevision: Number.MAX_SAFE_INTEGER + 1 };
        expect(() => storeLibraryBoundary(storage, owner, unsafe)).toThrow();
        storage.setItem(`netflux.library-boundary.v1:${owner}`, JSON.stringify(unsafe));
        expect(readLibraryBoundary(storage, owner)).toBeUndefined();
    });
    for (const item of zodContractCases) {
        it(item.name, () => {
            const before = baseline[item.name as keyof typeof baseline];
            if (tightened.has(item.name)) {
                expect(before.accepted).toBe(true);
                expect(contractResult(item.schema, item.input).accepted).toBe(false);
            } else {
                expect(contractResult(item.schema, item.input)).toEqual(before);
            }
        });
    }
});
