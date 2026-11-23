import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAnnotatedArchiveReader, getAnnotatedEarlierVersion } from "@/lib/server/annotated-reader";

const session = vi.hoisted(() => ({ getUser: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: session.getUser } }) }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: session.admin }));
const edition = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000002";
const load = vi.fn<typeof fetch>();

describe("annotated reader access", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        session.getUser.mockResolvedValue({ data: { user: { id: owner } } });
        session.admin.mockReturnValue(createClient("https://db.example", "test-key", { global: { fetch: load } }));
        load.mockResolvedValue(new Response("[]", { headers: { "Content-Type": "application/json" } }));
    });

    it("keeps invalid identifiers and guest requests out of the privileged read", async () => {
        expect(await getAnnotatedArchiveReader("invalid")).toBeNull();
        expect(session.getUser).not.toHaveBeenCalled();
        session.getUser.mockResolvedValue({ data: { user: null } });
        expect(await getAnnotatedArchiveReader(edition)).toBeNull();
        expect(await getAnnotatedEarlierVersion(edition)).toBeNull();
        expect(session.admin).not.toHaveBeenCalled();
    });

    it.each([
        ["original", getAnnotatedArchiveReader, "source_id"],
        ["current", getAnnotatedEarlierVersion, "replacement_id"],
    ] as const)("scopes the %s lookup to the owner and a visible replacement", async (_, lookup, key) => {
        expect(await lookup(edition)).toBeNull();
        const query = new URL(load.mock.calls[0][0].toString()).searchParams;
        expect(query.get(key)).toBe(`eq.${edition}`);
        expect(query.get("source.highlights.user_id")).toBe(`eq.${owner}`);
        expect(query.get("source.reflections.user_id")).toBe(`eq.${owner}`);
        expect(query.get("source.or")).toBe("(highlights.not.is.null,reflections.not.is.null)");
        expect(query.get("source.status")).toBe("eq.verified");
        expect(query.get("source.deleted_at")).toBe("not.is.null");
        expect(query.get("replacement.status")).toBe("eq.verified");
        expect(query.get("replacement.deleted_at")).toBe("is.null");
        if (key === "source_id") {
            expect(query.get("source.segments.deleted_at")).toBe("is.null");
        } else {
            expect(query.get("select")).not.toContain("markdown_body");
            expect(query.get("order")).toBe("created_at.desc,source_id.asc");
            expect(query.get("limit")).toBe("1");
        }
    });
});
