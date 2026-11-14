import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/useReadingProgress", () => ({ useReadingProgress: () => ({storageScope:"guest"}) }));
import { useBatchContentItems } from "@/hooks/use-content-queries";
let client: QueryClient;
beforeEach(() => { client = new QueryClient({defaultOptions:{queries:{retry:false}}}); vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => Response.json(JSON.parse(init.body as string).ids.map((id: string) => ({id,title:id}))))); });
afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
const wrapper = ({children}:{children:ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
describe("Library content reuse", () => {
    it("reuses cards across lists, preserves display order and refreshes explicitly", async () => {
        const {result,rerender} = renderHook(({ids}) => useBatchContentItems(ids),{initialProps:{ids:["a","b","c"]},wrapper});
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        rerender({ids:["b","a"]});
        await waitFor(() => expect(result.current.data?.map(x=>x.id)).toEqual(["b","a"]));
        rerender({ids:["c"]}); await waitFor(() => expect(result.current.data?.map(x=>x.id)).toEqual(["c"]));
        expect(fetch).toHaveBeenCalledTimes(1);
        vi.mocked(fetch).mockResolvedValueOnce(Response.json([{id:"c",title:"Changed"}]));
        await act(async () => { await result.current.refetch(); });
        await waitFor(() => expect(result.current.data?.[0].title).toBe("Changed")); expect(fetch).toHaveBeenCalledTimes(2);
    });
    it("shares canonical requests while keeping each observer's order", async () => {
        const first = renderHook(() => useBatchContentItems(["b","a"]),{wrapper});
        const second = renderHook(() => useBatchContentItems(["a","b","a"]),{wrapper});
        await waitFor(() => expect(first.result.current.isSuccess && second.result.current.isSuccess).toBe(true));
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(first.result.current.data?.map(x=>x.id)).toEqual(["b","a"]);
        expect(second.result.current.data?.map(x=>x.id)).toEqual(["a","b"]);
    });
    it("cancels obsolete reads and masks old placeholder cards", async () => {
        let aborted = false;
        vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve,reject) => init?.signal?.addEventListener("abort",()=>{aborted=true;reject(new DOMException("Aborted","AbortError"));})));
        const {result,rerender} = renderHook(({ids})=>useBatchContentItems(ids),{initialProps:{ids:["a"]},wrapper});
        await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
        rerender({ids:["b"]});
        await waitFor(()=>expect(result.current.data?.map(x=>x.id)).toEqual(["b"]));
        expect(aborted).toBe(true);
    });
});
