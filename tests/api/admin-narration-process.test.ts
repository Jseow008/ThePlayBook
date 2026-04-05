import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/narration/process/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { generateNarrationAudio } from "@/lib/server/ai-narration";
import { getAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/server/rate-limit";

const { revalidatePathMock } = vi.hoisted(() => ({
    revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/admin/auth", () => ({
    verifyAdminSession: vi.fn(),
}));

vi.mock("@/lib/server/ai-narration", async () => {
    const actual = await vi.importActual("@/lib/server/ai-narration");
    return {
        ...actual,
        generateNarrationAudio: vi.fn(),
    };
});

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

describe("Admin narration processor API", () => {
    const originalCronSecret = process.env.CRON_SECRET;
    const uploadMock = vi.fn();
    const getPublicUrlMock = vi.fn();
    const removeMock = vi.fn();
    const contentUpdateMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.CRON_SECRET = originalCronSecret;
        (verifyAdminSession as any).mockResolvedValue(true);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
        (generateNarrationAudio as any).mockResolvedValue({
            audioBuffer: Buffer.from("mp3-data"),
            extension: "mp3",
            contentType: "audio/mpeg",
        });

        uploadMock.mockResolvedValue({ error: null });
        removeMock.mockResolvedValue({ error: null });
        getPublicUrlMock.mockImplementation((path: string) => ({
            data: {
                publicUrl: `https://example.supabase.co/storage/v1/object/public/audio/${path}`,
            },
        }));
    });

    it("returns processed false when no queued jobs are available", async () => {
        const queueSelectChain = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };

        (getAdminClient as any).mockReturnValue({
            from: vi.fn(() => ({
                select: vi.fn().mockReturnValue(queueSelectChain),
            })),
            storage: {
                from: vi.fn(() => ({
                    upload: uploadMock,
                    getPublicUrl: getPublicUrlMock,
                    remove: removeMock,
                })),
            },
        });

        const req = new NextRequest("http://localhost/api/admin/narration/process", {
            method: "POST",
        });

        const res = await POST(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(rateLimit).toHaveBeenCalledWith(req, expect.objectContaining({
            limit: 10,
            windowMs: 60_000,
            key: "process",
        }));
        expect(json.data.processed).toBe(false);
        expect(generateNarrationAudio).not.toHaveBeenCalled();
    });

    it("claims and processes one queued narration job", async () => {
        const queueSelectChain = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
                data: [{ id: "11111111-1111-1111-1111-111111111111" }],
                error: null,
            }),
        };

        const claimMaybeSingleMock = vi.fn().mockResolvedValue({
            data: {
                id: "11111111-1111-1111-1111-111111111111",
                narration_started_at: "2026-04-05T08:00:05.000Z",
            },
            error: null,
        });
        const claimUpdateChain = {
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        maybeSingle: claimMaybeSingleMock,
                    }),
                }),
            }),
        };

        const fetchContentChain = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: {
                    id: "11111111-1111-1111-1111-111111111111",
                    status: "verified",
                    title: "Atomic Habits Summary",
                    author: "James Clear",
                    audio_url: "https://example.supabase.co/storage/v1/object/public/audio/generated/11111111-1111-1111-1111-111111111111/ai-narration-old.mp3",
                    narration_completed_at: "2026-04-05T07:59:00.000Z",
                    quick_mode_json: null,
                    segments: [
                        {
                            order_index: 1,
                            title: "Make it obvious",
                            markdown_body: "Cue your habits with visible triggers.",
                            deleted_at: null,
                        },
                    ],
                },
                error: null,
            }),
        };

        const readyUpdateMaybeSingleMock = vi.fn().mockResolvedValue({
            data: { id: "11111111-1111-1111-1111-111111111111" },
            error: null,
        });
        contentUpdateMock
            .mockReturnValueOnce(claimUpdateChain)
            .mockReturnValueOnce({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                select: vi.fn().mockReturnValue({
                                    maybeSingle: readyUpdateMaybeSingleMock,
                                }),
                            }),
                        }),
                    }),
                }),
            });

        (getAdminClient as any).mockReturnValue({
            from: vi.fn()
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnValue(queueSelectChain),
                })
                .mockReturnValueOnce({
                    update: contentUpdateMock,
                })
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnValue(fetchContentChain),
                })
                .mockReturnValueOnce({
                    update: contentUpdateMock,
                }),
            storage: {
                from: vi.fn(() => ({
                    upload: uploadMock,
                    getPublicUrl: getPublicUrlMock,
                    remove: removeMock,
                })),
            },
        });

        const req = new NextRequest("http://localhost/api/admin/narration/process", {
            method: "POST",
        });

        const res = await POST(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(rateLimit).toHaveBeenCalledWith(req, expect.objectContaining({
            limit: 10,
            windowMs: 60_000,
            key: "process",
        }));
        expect(json.data.processed).toBe(true);
        expect(generateNarrationAudio).toHaveBeenCalled();
        expect(uploadMock).toHaveBeenCalledWith(
            expect.stringMatching(/^generated\/11111111-1111-1111-1111-111111111111\/ai-narration-.*\.mp3$/),
            expect.any(Blob),
            expect.objectContaining({
                contentType: "audio/mpeg",
                upsert: true,
            })
        );
        expect(removeMock).toHaveBeenCalledWith([
            "generated/11111111-1111-1111-1111-111111111111/ai-narration-old.mp3",
        ]);
        expect(revalidatePathMock).toHaveBeenCalledWith("/read/11111111-1111-1111-1111-111111111111");
    });

    it("discards uploaded audio if the worker loses ownership before final save", async () => {
        const queueSelectChain = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
                data: [{ id: "11111111-1111-1111-1111-111111111111" }],
                error: null,
            }),
        };

        const claimMaybeSingleMock = vi.fn().mockResolvedValue({
            data: {
                id: "11111111-1111-1111-1111-111111111111",
                narration_started_at: "2026-04-05T08:00:05.000Z",
            },
            error: null,
        });
        const claimUpdateChain = {
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        maybeSingle: claimMaybeSingleMock,
                    }),
                }),
            }),
        };

        const fetchContentChain = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: {
                    id: "11111111-1111-1111-1111-111111111111",
                    status: "verified",
                    title: "Atomic Habits Summary",
                    author: "James Clear",
                    audio_url: null,
                    narration_completed_at: null,
                    quick_mode_json: null,
                    segments: [
                        {
                            order_index: 1,
                            title: "Make it obvious",
                            markdown_body: "Cue your habits with visible triggers.",
                            deleted_at: null,
                        },
                    ],
                },
                error: null,
            }),
        };

        contentUpdateMock
            .mockReturnValueOnce(claimUpdateChain)
            .mockReturnValueOnce({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                select: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: null,
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    }),
                }),
            });

        (getAdminClient as any).mockReturnValue({
            from: vi.fn()
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnValue(queueSelectChain),
                })
                .mockReturnValueOnce({
                    update: contentUpdateMock,
                })
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnValue(fetchContentChain),
                })
                .mockReturnValueOnce({
                    update: contentUpdateMock,
                }),
            storage: {
                from: vi.fn(() => ({
                    upload: uploadMock,
                    getPublicUrl: getPublicUrlMock,
                    remove: removeMock,
                })),
            },
        });

        const req = new NextRequest("http://localhost/api/admin/narration/process", {
            method: "POST",
        });

        const res = await POST(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data.processed).toBe(false);
        expect(json.data.discarded).toBe(true);
        expect(removeMock).toHaveBeenCalledWith([
            expect.stringMatching(/^generated\/11111111-1111-1111-1111-111111111111\/ai-narration-.*\.mp3$/),
        ]);
    });

    it("allows cron-authenticated GET processing without an admin session", async () => {
        process.env.CRON_SECRET = "test-cron-secret";
        (verifyAdminSession as any).mockResolvedValue(false);

        const queueSelectChain = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };

        (getAdminClient as any).mockReturnValue({
            from: vi.fn(() => ({
                select: vi.fn().mockReturnValue(queueSelectChain),
            })),
            storage: {
                from: vi.fn(() => ({
                    upload: uploadMock,
                    getPublicUrl: getPublicUrlMock,
                    remove: removeMock,
                })),
            },
        });

        const req = new NextRequest("http://localhost/api/admin/narration/process", {
            method: "GET",
            headers: {
                authorization: "Bearer test-cron-secret",
            },
        });

        const res = await GET(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data.processed).toBe(false);
        expect(rateLimit).not.toHaveBeenCalled();
    });

    it("lets cron drain more than one queued narration job per run", async () => {
        process.env.CRON_SECRET = "test-cron-secret";
        (verifyAdminSession as any).mockResolvedValue(false);

        const queueSelectChain = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn()
                .mockResolvedValueOnce({
                    data: [{ id: "job-1" }],
                    error: null,
                })
                .mockResolvedValueOnce({
                    data: [{ id: "job-2" }],
                    error: null,
                })
                .mockResolvedValueOnce({
                    data: [],
                    error: null,
                }),
        };

        const claimMaybeSingleMock = vi.fn()
            .mockResolvedValueOnce({
                data: {
                    id: "job-1",
                    narration_started_at: "2026-04-05T08:00:05.000Z",
                },
                error: null,
            })
            .mockResolvedValueOnce({
                data: {
                    id: "job-2",
                    narration_started_at: "2026-04-05T08:05:05.000Z",
                },
                error: null,
            });
        const claimUpdateChain = {
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        maybeSingle: claimMaybeSingleMock,
                    }),
                }),
            }),
        };

        const fetchContentChainOne = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: {
                    id: "job-1",
                    status: "verified",
                    title: "Job 1",
                    author: "Author 1",
                    audio_url: null,
                    narration_completed_at: null,
                    quick_mode_json: null,
                    segments: [{ order_index: 1, title: "A", markdown_body: "A body", deleted_at: null }],
                },
                error: null,
            }),
        };
        const fetchContentChainTwo = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: {
                    id: "job-2",
                    status: "verified",
                    title: "Job 2",
                    author: "Author 2",
                    audio_url: null,
                    narration_completed_at: null,
                    quick_mode_json: null,
                    segments: [{ order_index: 1, title: "B", markdown_body: "B body", deleted_at: null }],
                },
                error: null,
            }),
        };

        const readyUpdateMaybeSingleOne = vi.fn().mockResolvedValue({
            data: { id: "job-1" },
            error: null,
        });
        const readyUpdateMaybeSingleTwo = vi.fn().mockResolvedValue({
            data: { id: "job-2" },
            error: null,
        });

        contentUpdateMock
            .mockReturnValueOnce(claimUpdateChain)
            .mockReturnValueOnce({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                select: vi.fn().mockReturnValue({
                                    maybeSingle: readyUpdateMaybeSingleOne,
                                }),
                            }),
                        }),
                    }),
                }),
            })
            .mockReturnValueOnce(claimUpdateChain)
            .mockReturnValueOnce({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                select: vi.fn().mockReturnValue({
                                    maybeSingle: readyUpdateMaybeSingleTwo,
                                }),
                            }),
                        }),
                    }),
                }),
            });

        (getAdminClient as any).mockReturnValue({
            from: vi.fn()
                .mockReturnValueOnce({ select: vi.fn().mockReturnValue(queueSelectChain) })
                .mockReturnValueOnce({ update: contentUpdateMock })
                .mockReturnValueOnce({ select: vi.fn().mockReturnValue(fetchContentChainOne) })
                .mockReturnValueOnce({ update: contentUpdateMock })
                .mockReturnValueOnce({ select: vi.fn().mockReturnValue(queueSelectChain) })
                .mockReturnValueOnce({ update: contentUpdateMock })
                .mockReturnValueOnce({ select: vi.fn().mockReturnValue(fetchContentChainTwo) })
                .mockReturnValueOnce({ update: contentUpdateMock })
                .mockReturnValueOnce({ select: vi.fn().mockReturnValue(queueSelectChain) }),
            storage: {
                from: vi.fn(() => ({
                    upload: uploadMock,
                    getPublicUrl: getPublicUrlMock,
                    remove: removeMock,
                })),
            },
        });

        const req = new NextRequest("http://localhost/api/admin/narration/process", {
            method: "GET",
            headers: {
                authorization: "Bearer test-cron-secret",
            },
        });

        const res = await GET(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data.processed).toBe(true);
        expect(json.data.processedCount).toBe(2);
        expect(generateNarrationAudio).toHaveBeenCalledTimes(2);
        expect(rateLimit).not.toHaveBeenCalled();
    });
});
