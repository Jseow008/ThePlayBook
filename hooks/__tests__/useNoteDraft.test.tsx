import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteDraft } from "@/hooks/useNoteDraft";
import { clearNoteDrafts } from "@/lib/note-draft";
const auth = vi.hoisted(() => ({ user: { id: "account-a" } as { id: string } | null, sessionEpoch: 0 }));
vi.mock("@/hooks/useAuthUser", () => ({ useAuthSessionIdentity: () => auth }));
const original = { id: "highlight-a", note_body: "Saved original", color: "blue", updated_at: "v1", user_id: "account-a" };
let saved = { ...original };
const fetcher = vi.fn();
beforeEach(() => {
    clearNoteDrafts(); auth.user = { id: "account-a" }; auth.sessionEpoch = 0; saved = { ...original };
    fetcher.mockReset().mockImplementation(async () => ({ ok: true, json: async () => ({ data: saved }) }));
    vi.stubGlobal("fetch", fetcher);
});

describe("unfinished note safety", () => {
    it("retains edits across unmount/navigation and reload recovery without sending a save", async () => {
        const first = renderHook(() => useNoteDraft(original));
        await waitFor(() => expect(first.result.current.ready).toBe(true));
        act(() => first.result.current.setNote("Unfinished thought"));
        first.unmount();
        const second = renderHook(() => useNoteDraft(original));
        await waitFor(() => expect(second.result.current.note).toBe("Unfinished thought"));
        expect(fetcher.mock.calls.every(([, options]) => !options.method)).toBe(true);
    });
    it("explicit discard removes the recovered draft", async () => {
        const first = renderHook(() => useNoteDraft(original));
        await waitFor(() => expect(first.result.current.ready).toBe(true));
        act(() => first.result.current.setNote("discard me"));
        act(() => first.result.current.discard()); first.unmount();
        const second = renderHook(() => useNoteDraft(original));
        await waitFor(() => expect(second.result.current.note).toBe("Saved original"));
    });
    it("never restores old text over a newer saved version without explicit recovery", async () => {
        const first = renderHook(() => useNoteDraft(original));
        await waitFor(() => expect(first.result.current.ready).toBe(true));
        act(() => first.result.current.setNote("Older unfinished text")); first.unmount();
        saved = { ...original, note_body: "Newer saved note", updated_at: "v2" };
        const second = renderHook(() => useNoteDraft(original));
        await waitFor(() => expect(second.result.current.conflict).toBe(true));
        expect(second.result.current.note).toBe("Newer saved note"); expect(second.result.current.ready).toBe(false);
        act(() => second.result.current.resolve(true));
        expect(second.result.current.note).toBe("Older unfinished text");
        expect(second.result.current.expected?.updated_at).toBe("v2");
    });
    it("keeps highlights and accounts separate, including in-flight responses", async () => {
        const first = renderHook(({ target }) => useNoteDraft(target), { initialProps: { target: original } });
        await waitFor(() => expect(first.result.current.ready).toBe(true));
        act(() => first.result.current.setNote("Private A"));
        saved = { ...original, id: "highlight-b", user_id: "account-b", note_body: "B saved" };
        auth.user = { id: "account-b" }; auth.sessionEpoch++;
        first.rerender({ target: { ...original, id: "highlight-b", user_id: "account-b" } });
        expect(first.result.current.note).not.toBe("Private A");
        await waitFor(() => expect(first.result.current.note).toBe("B saved"));
        auth.user = { id: "account-a" }; auth.sessionEpoch++; saved = { ...original };
        first.rerender({ target: original });
        await waitFor(() => expect(first.result.current.note).toBe("Private A"));
    });
    it("keeps a rejected draft during recheck and never enables save after failed ownership/read checks", async () => {
        const first = renderHook(() => useNoteDraft(original));
        await waitFor(() => expect(first.result.current.ready).toBe(true));
        act(() => first.result.current.setNote("Keep after failed save"));
        fetcher.mockResolvedValueOnce({ ok: false, status: 500 });
        act(() => first.result.current.refresh());
        await waitFor(() => expect(first.result.current.error).toBeTruthy());
        expect(first.result.current.note).toBe("Keep after failed save"); expect(first.result.current.ready).toBe(false);
    });
    it("preserves unsaved selection notes by account, content, and exact selected range", async () => {
        const target = { ...original, id: "new:book:segment:0:20", isNew: true, note_body: null, updated_at: null };
        const first = renderHook(() => useNoteDraft(target));
        await waitFor(() => expect(first.result.current.ready).toBe(true));
        act(() => first.result.current.setNote("Selection thought")); first.unmount();
        const second = renderHook(() => useNoteDraft(target));
        await waitFor(() => expect(second.result.current.note).toBe("Selection thought"));
        expect(fetcher).not.toHaveBeenCalled();
    });
});
