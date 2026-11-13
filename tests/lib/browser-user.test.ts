import { describe, expect, it, vi } from "vitest";
import { getBrowserUser } from "@/lib/supabase/browser-user";

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
});
