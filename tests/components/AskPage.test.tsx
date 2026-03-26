import AskPage from "@/app/(public)/ask/page";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    redirect: vi.fn(),
}));

vi.mock("@/app/(public)/ask/client-page", () => ({
    AskClientPage: () => null,
}));

describe("AskPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("preserves notes ask context in the login redirect", async () => {
        const redirectSignal = new Error("NEXT_REDIRECT");
        (redirect as any).mockImplementation(() => {
            throw redirectSignal;
        });
        const notesScope = JSON.stringify({
            highlightIds: ["123e4567-e89b-12d3-a456-426614174000"],
            noteCount: 1,
            totalMatches: 1,
            summary: 'search: "discipline"',
            signature: "scope-discipline",
        });
        (createClient as any).mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({
                    data: { user: null },
                    error: null,
                }),
            },
        });

        await expect(() =>
            AskPage({
                searchParams: Promise.resolve({
                    scope: "notes",
                    returnTo: "/notes?ask=1&q=discipline",
                    notesScope,
                }),
            })
        ).rejects.toThrow(redirectSignal);

        const nextParams = new URLSearchParams({
            returnTo: "/notes?ask=1&q=discipline",
            scope: "notes",
            notesScope,
        });

        expect(redirect).toHaveBeenCalledWith(
            `/login?next=${encodeURIComponent(`/ask?${nextParams.toString()}`)}`
        );
    });
});
