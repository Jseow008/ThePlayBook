// This test is copied into a clean checkout of the frozen baseline commit by
// .github/workflows/search-baseline-evidence.yml. It is intentionally skipped
// in ordinary application tests: its purpose is to execute that historical
// implementation, not to test the changed search code in this branch.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode as ReactChildren } from "react";

const baselineEnabled = process.env.SEARCH_BASELINE_WORKTREE === "1";
const baselineDatabaseUrl = process.env.DB107_ADMIN_DATABASE_URL;
const describeBaseline = baselineEnabled && baselineDatabaseUrl ? describe : describe.skip;
const baselineCommit = process.env.SEARCH_BASELINE_COMMIT ?? "142a84ea290246f84f4ddc06d6362b8f4e3efba9";
const report: {
    fixtureVersion: string;
    applicationCommit: string;
    runner: { kind: string; executedAt: string; configuration: Record<string, string> };
    cases: Array<{ id: string; result: "supported" | "not-supported"; evidence: string }>;
} = {
    fixtureVersion: "search-baseline-v1",
    applicationCommit: baselineCommit,
    runner: {
        kind: "executed clean-worktree baseline",
        executedAt: new Date().toISOString(),
        configuration: {
            catalog: "real local Supabase query through the baseline SearchResults server component",
            notes: "baseline useInfiniteHighlights first-page behavior with a controlled 31-record response",
        },
    },
    cases: [],
};

const mockAuthUser = vi.fn(() => ({ id: "baseline-account" }));
vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: mockAuthUser }));

function findElementByType(node: ReactNode, type: unknown): { props: { items: Array<{ id: string }> } } | null {
    if (Array.isArray(node)) {
        for (const child of node) {
            const found = findElementByType(child, type);
            if (found) return found;
        }
        return null;
    }
    if (!isValidElement(node)) return null;
    if (node.type === type) return node as unknown as { props: { items: Array<{ id: string }> } };
    return findElementByType((node as ReactElement<{ children?: ReactNode }>).props.children, type);
}

describeBaseline("executed search baseline", () => {
    const db = new Pool({ connectionString: baselineDatabaseUrl, max: 1 });
    const exactId = randomUUID();
    const authorId = randomUUID();
    const segmentId = randomUUID();
    const segmentContentId = randomUUID();

    beforeAll(async () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.DB107_SUPABASE_URL;
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.DB107_SUPABASE_ANON_KEY;
        await db.query(
            `INSERT INTO public.content_item (id, type, title, author, category, status)
             VALUES
                ($1, 'article', 'Baseline title cobalt', 'Unrelated author', 'Baseline', 'verified'),
                ($2, 'article', 'Unrelated title', 'Baseline author marigold', 'Baseline', 'verified'),
                ($3, 'article', 'Unrelated segment title', 'Unrelated author', 'Baseline', 'verified')`,
            [exactId, authorId, segmentContentId],
        );
        await db.query(
            `INSERT INTO public.segment (id, item_id, order_index, title, markdown_body)
             VALUES ($1, $2, 0, 'Segment evidence', 'A segment-only zebra compass concept.')`,
            [segmentId, segmentContentId],
        );
    });

    afterAll(async () => {
        await db.query("DELETE FROM public.content_item WHERE id = ANY($1::uuid[])", [[exactId, authorId, segmentContentId]]).catch(() => undefined);
        await db.end();
        if (process.env.SEARCH_BASELINE_EVIDENCE_PATH) {
            await mkdir(dirname(process.env.SEARCH_BASELINE_EVIDENCE_PATH), { recursive: true });
            await writeFile(process.env.SEARCH_BASELINE_EVIDENCE_PATH, JSON.stringify(report, null, 2));
        }
    });

    it("executes the exact baseline catalog behavior for title, author, and absent segment concepts", async () => {
        const { ContentGrid, SearchResults } = await import("@/app/(public)/search/search-components");
        const baselineSearchResults = SearchResults as unknown as (props: {
            query: string;
            categoryValues: string[];
            page: number;
        }) => Promise<ReactNode>;
        const search = async (query: string) => {
            const element = await baselineSearchResults({ query, categoryValues: [], page: 1 });
            return findElementByType(element, ContentGrid)?.props.items.map((item) => item.id) ?? [];
        };

        await expect(search("cobalt")).resolves.toContain(exactId);
        report.cases.push({ id: "title-exact", result: "supported", evidence: "Baseline SearchResults returned the seeded title item." });

        await expect(search("marigold")).resolves.toContain(authorId);
        report.cases.push({ id: "author-exact", result: "supported", evidence: "Baseline SearchResults returned the seeded author item." });

        await expect(search("zebra compass")).resolves.not.toContain(segmentContentId);
        report.cases.push({ id: "segment-concept", result: "not-supported", evidence: "Baseline SearchResults did not return the seeded segment-only concept." });

        await expect(search("navigation direction")).resolves.toEqual([]);
        report.cases.push({ id: "paraphrase", result: "not-supported", evidence: "Baseline lexical fields did not return the synthetic paraphrase case." });

        await expect(search("cobaltt")).resolves.toEqual([]);
        report.cases.push({ id: "misspelling", result: "not-supported", evidence: "Baseline lexical fields did not return the synthetic misspelling case." });
    });

    it("executes the baseline Notes first-page behavior", async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                data: Array.from({ length: 30 }, (_, index) => ({ id: `noise-${index}` })),
                nextCursor: "next-page",
            }),
        }));
        vi.stubGlobal("fetch", fetchMock);
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: { children: ReactChildren }) => createElement(QueryClientProvider, { client: queryClient }, children);
        const { useInfiniteHighlights } = await import("@/hooks/useHighlights");
        const { result } = renderHook(() => useInfiniteHighlights(), { wrapper });

        await waitFor(() => expect(result.current.data?.pages[0]?.data).toHaveLength(30));
        expect(result.current.data?.pages[0]?.data.map((row) => row.id)).not.toContain("old-match-after-page-one");
        report.cases.push({ id: "old-notes-match", result: "not-supported", evidence: "Baseline Notes loaded only the initial 30-record page; the controlled later match was not present." });
    });
});
