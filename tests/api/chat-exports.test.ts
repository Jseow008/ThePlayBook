import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/chat/exports/route";
import { GET } from "@/app/api/chat/exports/[id]/route";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/server/rate-limit";
import { clearFallbackChatExportsForTests } from "@/lib/server/chat-export-store";

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

vi.mock("@/lib/server/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/api")>("@/lib/server/api");
    return {
        ...actual,
        getRequestId: vi.fn(() => "chat-export-test-request"),
        logApiError: vi.fn(),
    };
});

describe("Chat export API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearFallbackChatExportsForTests();
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({
                    data: { user: { id: "user-1" } },
                    error: null,
                }),
            },
        });
    });

    it("creates and reads an encrypted temporary export", async () => {
        const request = new NextRequest(new URL("http://localhost/api/chat/exports"), {
            method: "POST",
            body: JSON.stringify({
                payload: {
                    version: 1,
                    ciphertext: "encrypted-payload",
                    iv: "abcdefghijkl",
                },
                messageCount: 2,
            }),
        });

        const createResponse = await POST(request);
        const created = await createResponse.json() as { id: string; expiresAt: string };

        expect(createResponse.status).toBe(201);
        expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(new Date(created.expiresAt).getTime()).toBeGreaterThan(Date.now());

        const readResponse = await GET(
            new NextRequest(new URL(`http://localhost/api/chat/exports/${created.id}`)),
            { params: Promise.resolve({ id: created.id }) }
        );
        const readBody = await readResponse.json();

        expect(readResponse.status).toBe(200);
        expect(readResponse.headers.get("Cache-Control")).toBe("no-store");
        expect(readBody).toEqual({
            payload: {
                version: 1,
                ciphertext: "encrypted-payload",
                iv: "abcdefghijkl",
            },
            expiresAt: created.expiresAt,
        });
    });

    it("requires a logged-in user to create an export", async () => {
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            auth: {
                getUser: vi.fn().mockResolvedValue({
                    data: { user: null },
                    error: null,
                }),
            },
        });

        const response = await POST(new NextRequest(new URL("http://localhost/api/chat/exports"), {
            method: "POST",
            body: JSON.stringify({
                payload: { version: 1, ciphertext: "encrypted", iv: "abcdefghijkl" },
                messageCount: 1,
            }),
        }));
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects invalid encrypted payloads", async () => {
        const response = await POST(new NextRequest(new URL("http://localhost/api/chat/exports"), {
            method: "POST",
            body: JSON.stringify({
                payload: { version: 1, ciphertext: "", iv: "short" },
                messageCount: 1,
            }),
        }));
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns gone for missing or expired exports", async () => {
        const response = await GET(
            new NextRequest(new URL("http://localhost/api/chat/exports/6b3d14b1-4fcb-4baa-8c62-8f9d1f863c30")),
            { params: Promise.resolve({ id: "6b3d14b1-4fcb-4baa-8c62-8f9d1f863c30" }) }
        );
        const body = await response.json();

        expect(response.status).toBe(410);
        expect(body.error.message).toBe("This chat export has expired.");
    });
});
