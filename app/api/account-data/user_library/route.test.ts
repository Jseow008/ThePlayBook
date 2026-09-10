import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/account-data/user_library/route";
import { createClient } from "@/lib/supabase/server";
import { getLiveLibraryPage } from "@/lib/server/account-data-snapshots";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/account-data-snapshots", () => ({ getLiveLibraryPage: vi.fn() }));

describe("GET /api/account-data/user_library", () => {
    const getUser = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ACCOUNT_DATA_CURSOR_SECRET = "test-live-library-secret";
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ auth: { getUser } });
        getUser.mockResolvedValue({ data: { user: { id: "account-a" } } });
        (getLiveLibraryPage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            rows: [{
                content_id: "00000000-0000-4000-8000-000000000001",
                is_bookmarked: true,
                progress: null,
                last_interacted_at: null,
                library_updated_at: "2026-09-10T12:00:00.000Z",
                library_revision: 1,
            }],
            hasNextPage: true,
        });
    });

    it("binds the query and its signed cursor to the authenticated account", async () => {
        const first = await GET(new NextRequest("http://localhost/api/account-data/user_library?limit=1"));
        const payload = await first.json() as { pageInfo: { endCursor: string } };

        expect(first.status).toBe(200);
        expect(getLiveLibraryPage).toHaveBeenCalledWith("account-a", null, 1);

        getUser.mockResolvedValue({ data: { user: { id: "account-b" } } });
        const replay = await GET(new NextRequest(`http://localhost/api/account-data/user_library?cursor=${payload.pageInfo.endCursor}`));
        expect(replay.status).toBe(400);
        expect(getLiveLibraryPage).toHaveBeenCalledTimes(1);
    });

    it("rejects unauthenticated live-list reads", async () => {
        getUser.mockResolvedValue({ data: { user: null } });
        const response = await GET(new NextRequest("http://localhost/api/account-data/user_library"));
        expect(response.status).toBe(401);
        expect(getLiveLibraryPage).not.toHaveBeenCalled();
    });
});
