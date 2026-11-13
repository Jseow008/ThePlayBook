import { describe, expect, it, vi } from "vitest";
import { getBrowserUser, resetBrowserUserLookup } from "@/lib/supabase/browser-user";

const getUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({ auth: { getUser } }),
}));

describe("browser user bootstrap", () => {
    it("shares only the pending lookup and reads a fresh identity afterward", async () => {
        let resolve!: (value: unknown) => void;
        getUser.mockReturnValueOnce(new Promise(next => { resolve = next; }));
        const first = getBrowserUser();
        expect(getBrowserUser()).toBe(first);
        expect(getUser).toHaveBeenCalledTimes(1);
        resolve({ data: { user: { id: "account-a" } }, error: null });
        await first;

        getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
        expect(await getBrowserUser()).toEqual({ data: { user: null }, error: null });
        expect(getUser).toHaveBeenCalledTimes(2);
    });

    it("allows a new lookup after a rejected request", async () => {
        getUser.mockRejectedValueOnce(new Error("Network error"));
        await expect(getBrowserUser()).rejects.toThrow("Network error");
        getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
        await expect(getBrowserUser()).resolves.toEqual({ data: { user: null }, error: null });
    });

    it("isolates a new session while the previous lookup is still pending", async () => {
        let resolveOld!: (value: unknown) => void;
        let resolveNew!: (value: unknown) => void;
        getUser.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
        const oldSession = getBrowserUser();
        resetBrowserUserLookup();
        getUser.mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve; }));
        const newSession = getBrowserUser();
        expect(newSession).not.toBe(oldSession);
        resolveOld({ data: { user: { id: "old-account" } }, error: null });
        await oldSession;
        expect(getBrowserUser()).toBe(newSession);
        resolveNew({ data: { user: { id: "new-account" } }, error: null });
        await newSession;
    });
});
