import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/(public)/settings/page";

const { MockAccountDataExportError, state } = vi.hoisted(() => {
    class MockAccountDataExportError extends Error {
        code: string;

        constructor(message: string, code = "EXPORT_UNAVAILABLE") {
            super(message);
            this.name = "AccountDataExportError";
            this.code = code;
        }
    }

    return {
        MockAccountDataExportError,
        state: {
            currentUser: null as { id: string; email?: string; user_metadata?: { full_name?: string } } | null,
            authListener: null as ((event: string, session: { user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null } | null) => void) | null,
            getUser: vi.fn(),
            getClaims: vi.fn(),
            onAuthStateChange: vi.fn(),
            signOut: vi.fn(),
            signOutAction: vi.fn(),
            fetchExport: vi.fn(),
            fetch: vi.fn(),
            refresh: vi.fn(),
            clearScopedReadingHistory: vi.fn(),
            clearCachedRecommendations: vi.fn(),
            clearCachedBrowseRecommendations: vi.fn(),
            clearRecentRecommendations: vi.fn(),
            toastSuccess: vi.fn(),
            toastError: vi.fn(),
            captureAnalyticsEvent: vi.fn(),
        },
    };
});

vi.mock("@/lib/supabase/client", () => {
    const client = {
        auth: {
            getUser: state.getUser,
            getClaims: state.getClaims,
            onAuthStateChange: state.onAuthStateChange,
            updateUser: vi.fn(),
            signOut: state.signOut,
        },
    };
    return { createClient: () => client };
});

vi.mock("@/lib/account-data-export-client", () => ({
    AccountDataExportError: MockAccountDataExportError,
    fetchVerifiedAccountDataExport: (...args: unknown[]) => state.fetchExport(...args),
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => ({ refresh: state.refresh, storageScope: "user:test-user" }),
}));

vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/actions/auth", () => ({ signOutAction: () => state.signOutAction() }));
vi.mock("@/lib/local-user-storage", () => ({ clearScopedReadingHistory: (...args: unknown[]) => state.clearScopedReadingHistory(...args) }));
vi.mock("@/lib/recommendation-memory", () => ({
    clearCachedRecommendations: (...args: unknown[]) => state.clearCachedRecommendations(...args),
    clearRecentRecommendations: (...args: unknown[]) => state.clearRecentRecommendations(...args),
}));
vi.mock("@/lib/browse-recommendation-cache", () => ({ clearCachedBrowseRecommendations: (...args: unknown[]) => state.clearCachedBrowseRecommendations(...args) }));

vi.mock("sonner", () => ({
    toast: {
        success: (...args: unknown[]) => state.toastSuccess(...args),
        error: (...args: unknown[]) => state.toastError(...args),
    },
}));
vi.mock("@/lib/analytics", () => ({
    captureAnalyticsEvent: (...args: unknown[]) => state.captureAnalyticsEvent(...args),
}));

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });
    return { promise, resolve, reject };
}

const accountA = { id: "account-a", email: "account-a@example.invalid", user_metadata: { full_name: "Account A" } };
const accountB = { id: "account-b", email: "account-b@example.invalid", user_metadata: { full_name: "Account B" } };
const accountASessionId = "00000000-0000-4000-8000-000000000101";
const accountBSessionId = "00000000-0000-4000-8000-000000000102";
const verifiedExport = {
    export_date: "2026-09-15T00:00:00.000Z",
    schema_version: 2,
    snapshot: { id: "snapshot-a" },
    data: { reflections: [] },
    timings: { snapshotPreparationMs: 10, collectionRetrievalMs: 20, verificationMs: 30 },
};

describe("settings data export delivery", () => {
    let createObjectUrl: ReturnType<typeof vi.fn>;
    let revokeObjectUrl: ReturnType<typeof vi.fn>;
    let anchorClick: ReturnType<typeof vi.fn<() => void>>;

    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        state.currentUser = accountA;
        state.authListener = null;
        state.getUser.mockImplementation(async () => ({ data: { user: state.currentUser }, error: null }));
        state.getClaims.mockImplementation(async () => ({
            data: { claims: state.currentUser ? { sub: state.currentUser.id, session_id: state.currentUser.id === accountA.id ? accountASessionId : accountBSessionId } : null },
            error: null,
        }));
        state.onAuthStateChange.mockImplementation((listener) => {
            state.authListener = listener;
            return { data: { subscription: { unsubscribe: vi.fn() } } };
        });
        state.signOut.mockResolvedValue({ error: null });
        state.signOutAction.mockResolvedValue(undefined);
        state.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            if (url === "/api/account-data/reset" && init?.method === "POST") {
                return new Response(JSON.stringify({ data: { resetEpoch: 1, currentRevision: 1 } }), { status: 200 });
            }
            return new Response(JSON.stringify({ data: {} }), { status: 200 });
        });
        createObjectUrl = vi.fn(() => "blob:export");
        revokeObjectUrl = vi.fn();
        anchorClick = vi.fn<() => void>();
        Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
        Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
            anchorClick();
        });
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.stubGlobal("fetch", state.fetch);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    async function renderAuthenticatedSettings() {
        const result = render(<SettingsPage />);
        const downloadButton = await screen.findByRole("button", { name: /download my data|resume data export/i });
        await waitFor(() => expect(downloadButton).toBeEnabled());
        return { ...result, downloadButton };
    }

    it("includes a replay app tour link for a guest", async () => {
        state.currentUser = null;
        render(<SettingsPage />);

        expect(await screen.findByText("Not signed in.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /replay app tour/i })).toHaveAttribute("href", "/browse?tour=app-v1");
    });

    it("clears local history and recommendation memory for a guest", async () => {
        state.currentUser = null;
        render(<SettingsPage />);
        await screen.findByText("Not signed in.");

        fireEvent.click(screen.getByRole("button", { name: /clear reading history/i }));
        vi.useFakeTimers();
        try {
            await act(async () => {
                fireEvent.click(screen.getByRole("button", { name: /click again to confirm/i }));
                vi.runAllTimers();
            });
        } finally {
            vi.useRealTimers();
        }

        expect(state.clearScopedReadingHistory).toHaveBeenCalledWith(localStorage, "user:test-user");
        expect(state.clearCachedRecommendations).toHaveBeenCalledWith(localStorage, "user:test-user");
        expect(state.clearCachedBrowseRecommendations).toHaveBeenCalledWith(localStorage, "user:test-user");
        expect(state.clearRecentRecommendations).toHaveBeenCalledWith(localStorage, "user:test-user");
        expect(state.refresh).toHaveBeenCalled();
        expect(state.toastSuccess).toHaveBeenCalledWith("Reading history cleared");
    });

    it("resets the authenticated library before clearing local state", async () => {
        state.currentUser = accountA;
        await renderAuthenticatedSettings();

        fireEvent.click(screen.getByRole("button", { name: /clear reading history/i }));
        vi.useFakeTimers();
        try {
            await act(async () => {
                fireEvent.click(screen.getByRole("button", { name: /click again to confirm/i }));
                vi.runAllTimers();
            });
        } finally {
            vi.useRealTimers();
        }

        expect(state.fetch).toHaveBeenCalledWith("/api/account-data/reset", { method: "POST" });
        expect(state.clearScopedReadingHistory).toHaveBeenCalledWith(localStorage, "user:test-user");
        expect(state.refresh).toHaveBeenCalled();
        expect(state.toastSuccess).toHaveBeenCalledWith("Reading history cleared");
    });

    it("keeps local history when an authenticated library reset fails", async () => {
        state.currentUser = accountA;
        state.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            if (url === "/api/account-data/reset" && init?.method === "POST") {
                return new Response(JSON.stringify({ error: { message: "Reset failed" } }), { status: 500 });
            }
            return new Response(JSON.stringify({ data: {} }), { status: 200 });
        });
        await renderAuthenticatedSettings();

        fireEvent.click(screen.getByRole("button", { name: /clear reading history/i }));
        vi.useFakeTimers();
        try {
            await act(async () => {
                fireEvent.click(screen.getByRole("button", { name: /click again to confirm/i }));
                vi.runAllTimers();
            });
        } finally {
            vi.useRealTimers();
        }

        expect(state.clearScopedReadingHistory).not.toHaveBeenCalled();
        expect(state.refresh).not.toHaveBeenCalled();
        expect(state.toastError).toHaveBeenCalledWith("Reset failed");
    });

    it("recovers the sign-out button when sign-out fails", async () => {
        state.currentUser = accountA;
        state.signOutAction.mockRejectedValue(new Error("Sign out failed"));
        await renderAuthenticatedSettings();

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
        });

        expect(state.signOut).toHaveBeenCalledTimes(1);
        expect(state.toastError).toHaveBeenCalledWith("Sign out failed");
        expect(screen.getByRole("button", { name: /sign out/i })).not.toBeDisabled();
    });

    it("fails an unavailable export without creating a download", async () => {
        state.fetchExport.mockRejectedValue(new Error("Snapshot unavailable"));
        const { downloadButton } = await renderAuthenticatedSettings();

        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.fetchExport).toHaveBeenCalledTimes(1));

        expect(createObjectUrl).not.toHaveBeenCalled();
        expect(anchorClick).not.toHaveBeenCalled();
        expect(state.toastError).toHaveBeenCalledWith("Failed to export data");
        expect(state.toastSuccess).not.toHaveBeenCalledWith("Data export complete");
    });

    it("shows the export retry guidance returned by the server", async () => {
        state.fetchExport.mockRejectedValue(new MockAccountDataExportError(
            "Too many export requests. Please try again in about 3 minutes.",
            "RATE_LIMITED",
        ));
        const { downloadButton } = await renderAuthenticatedSettings();

        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.fetchExport).toHaveBeenCalledTimes(1));

        expect(state.toastError).toHaveBeenCalledWith("Too many export requests. Please try again in about 3 minutes.");
        expect(createObjectUrl).not.toHaveBeenCalled();
    });

    it("shows factual export progress while preparation and verification are underway", async () => {
        const pendingExport = deferred<typeof verifiedExport>();
        state.fetchExport.mockImplementation(() => pendingExport.promise);
        const { downloadButton } = await renderAuthenticatedSettings();

        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.fetchExport).toHaveBeenCalledTimes(1));
        const options = state.fetchExport.mock.calls[0]?.[0] as {
            onProgress?: (progress: { phase: string; completedCollections: number; totalCollections: number; completedRecords: number; totalRecords: number | null }) => void;
        };

        act(() => options.onProgress?.({ phase: "downloading", completedCollections: 3, totalCollections: 11, completedRecords: 0, totalRecords: 242 }));
        expect(screen.getByText("Downloading 3 of 11 data categories…")).toBeInTheDocument();

        act(() => options.onProgress?.({ phase: "verifying", completedCollections: 0, totalCollections: 11, completedRecords: 115, totalRecords: 242 }));
        expect(screen.getByText("Verifying 115 of 242 records…")).toBeInTheDocument();

    });

    it("ignores progress reported by an export cancelled after an account switch", async () => {
        const pendingExport = deferred<typeof verifiedExport>();
        state.fetchExport.mockImplementation(() => pendingExport.promise);
        const { downloadButton } = await renderAuthenticatedSettings();

        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.fetchExport).toHaveBeenCalledTimes(1));
        const options = state.fetchExport.mock.calls[0]?.[0] as {
            onProgress?: (progress: { phase: string; completedCollections: number; totalCollections: number; completedRecords: number; totalRecords: number | null }) => void;
        };

        state.currentUser = accountB;
        await act(async () => {
            state.authListener?.("SIGNED_IN", { user: accountB });
            await Promise.resolve();
        });
        act(() => options.onProgress?.({ phase: "verifying", completedCollections: 0, totalCollections: 11, completedRecords: 115, totalRecords: 242 }));

        expect(screen.queryByText("Verifying 115 of 242 records…")).not.toBeInTheDocument();
    });

    it("keeps an in-flight export active when a token refresh keeps the same account", async () => {
        const pendingExport = deferred<typeof verifiedExport>();
        state.fetchExport.mockImplementation(() => pendingExport.promise);
        const { downloadButton } = await renderAuthenticatedSettings();

        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.fetchExport).toHaveBeenCalledTimes(1));
        const options = state.fetchExport.mock.calls[0]?.[0] as {
            signal?: AbortSignal;
            onProgress?: (progress: { phase: string; completedCollections: number; totalCollections: number; completedRecords: number; totalRecords: number | null }) => void;
        };

        await act(async () => {
            state.authListener?.("TOKEN_REFRESHED", { user: accountA });
            await Promise.resolve();
        });
        expect(options.signal?.aborted).toBe(false);

        act(() => options.onProgress?.({ phase: "downloading", completedCollections: 7, totalCollections: 11, completedRecords: 0, totalRecords: 242 }));
        expect(screen.getByText("Downloading 7 of 11 data categories…")).toBeInTheDocument();
    });

    it("resumes a stored export reference without storing any payload", async () => {
        const snapshotId = "00000000-0000-4000-8000-000000000012";
        sessionStorage.setItem("netflux.account-data-export.resume.v1", snapshotId);
        const pendingExport = deferred<typeof verifiedExport>();
        state.fetchExport.mockImplementation(() => pendingExport.promise);
        const { downloadButton } = await renderAuthenticatedSettings();

        expect(await screen.findByText("Resume data export")).toBeInTheDocument();
        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.fetchExport).toHaveBeenCalledTimes(1));

        expect(state.fetchExport.mock.calls[0]?.[0]).toMatchObject({ resumeSnapshotId: snapshotId });
        expect(sessionStorage.getItem("netflux.account-data-export.resume.v1")).toBe(snapshotId);
    });

    it("offers a new export after an unavailable resume reference is rejected", async () => {
        const snapshotId = "00000000-0000-4000-8000-000000000013";
        sessionStorage.setItem("netflux.account-data-export.resume.v1", snapshotId);
        state.fetchExport.mockRejectedValue(new MockAccountDataExportError(
            "This previous export is no longer available. Start a new export.",
            "EXPIRED",
        ));
        const { downloadButton } = await renderAuthenticatedSettings();

        fireEvent.click(downloadButton);
        await waitFor(() => expect(screen.getByText("Start a new export")).toBeInTheDocument());

        expect(sessionStorage.getItem("netflux.account-data-export.resume.v1")).toBeNull();
        expect(state.toastError).toHaveBeenCalledWith("This previous export is no longer available. Start a new export.");
    });

    it("clears an export reference when a guest signs in to another account", async () => {
        const snapshotId = "00000000-0000-4000-8000-000000000014";
        sessionStorage.setItem("netflux.account-data-export.resume.v1", snapshotId);
        state.currentUser = null;
        render(<SettingsPage />);
        await screen.findByText("Not signed in.");

        state.currentUser = accountB;
        await act(async () => {
            state.authListener?.("SIGNED_IN", { user: accountB });
            await Promise.resolve();
        });

        expect(sessionStorage.getItem("netflux.account-data-export.resume.v1")).toBeNull();
    });

    it("renders the file-creation stage before completing the browser download", async () => {
        const animationFrames: FrameRequestCallback[] = [];
        vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
            animationFrames.push(callback);
            return animationFrames.length;
        }));
        state.fetchExport.mockResolvedValue(verifiedExport);
        const { downloadButton } = await renderAuthenticatedSettings();

        fireEvent.click(downloadButton);
        expect(await screen.findByText("Creating your JSON file…")).toBeInTheDocument();
        expect(anchorClick).not.toHaveBeenCalled();

        await act(async () => {
            animationFrames.shift()?.(0);
            await Promise.resolve();
            animationFrames.shift()?.(16);
            await Promise.resolve();
        });

        await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    });

    it("cancels a delayed final response when the account changes before delivery", async () => {
        const finalResponse = deferred<typeof verifiedExport>();
        state.fetchExport.mockImplementation(() => finalResponse.promise);
        const { downloadButton } = await renderAuthenticatedSettings();

        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.fetchExport).toHaveBeenCalledTimes(1));
        const signal = (state.fetchExport.mock.calls[0]?.[0] as { signal?: AbortSignal }).signal;

        state.currentUser = accountB;
        await act(async () => {
            state.authListener?.("SIGNED_IN", { user: accountB });
            await Promise.resolve();
        });
        expect(signal?.aborted).toBe(true);

        await act(async () => {
            finalResponse.resolve(verifiedExport);
            await Promise.resolve();
        });

        expect(createObjectUrl).not.toHaveBeenCalled();
        expect(anchorClick).not.toHaveBeenCalled();
        expect(state.toastSuccess).not.toHaveBeenCalledWith("Data export complete");
    });

    it("rechecks the authenticated account immediately before delivery", async () => {
        const authRecheck = deferred<{ data: { user: typeof accountA | typeof accountB }; error: null }>();
        state.fetchExport.mockResolvedValue(verifiedExport);
        const { downloadButton } = await renderAuthenticatedSettings();
        const callsBeforeAuthRecheck = state.getUser.mock.calls.length;
        state.getUser.mockImplementationOnce(() => authRecheck.promise);

        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.fetchExport).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(state.getUser.mock.calls.length).toBeGreaterThan(callsBeforeAuthRecheck));

        state.currentUser = accountB;
        await act(async () => {
            authRecheck.resolve({ data: { user: accountB }, error: null });
            await Promise.resolve();
        });

        expect(createObjectUrl).not.toHaveBeenCalled();
        expect(anchorClick).not.toHaveBeenCalled();
        expect(state.toastSuccess).not.toHaveBeenCalledWith("Data export complete");
    });

    it("cancels a delayed final page when the same account receives a replacement session", async () => {
        const claimsRecheck = deferred<{ data: { claims: { sub: string; session_id: string } }; error: null }>();
        state.fetchExport.mockResolvedValue(verifiedExport);
        const { downloadButton } = await renderAuthenticatedSettings();
        const claimsBeforeFinalRecheck = state.getClaims.mock.calls.length;
        state.getClaims.mockImplementationOnce(() => claimsRecheck.promise);

        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.getClaims.mock.calls.length).toBeGreaterThan(claimsBeforeFinalRecheck));

        state.getClaims.mockResolvedValue({
            data: { claims: { sub: accountA.id, session_id: accountBSessionId } },
            error: null,
        });
        await act(async () => {
            state.authListener?.("SIGNED_IN", { user: accountA });
            await Promise.resolve();
        });
        await act(async () => {
            claimsRecheck.resolve({ data: { claims: { sub: accountA.id, session_id: accountBSessionId } }, error: null });
            await Promise.resolve();
        });

        expect(createObjectUrl).not.toHaveBeenCalled();
        expect(anchorClick).not.toHaveBeenCalled();
        expect(state.toastSuccess).not.toHaveBeenCalledWith("Data export complete");
    });

    it("cancels delivery when the settings page unmounts during an export", async () => {
        const finalResponse = deferred<typeof verifiedExport>();
        state.fetchExport.mockImplementation(() => finalResponse.promise);
        const { downloadButton, unmount } = await renderAuthenticatedSettings();

        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.fetchExport).toHaveBeenCalledTimes(1));
        const signal = (state.fetchExport.mock.calls[0]?.[0] as { signal?: AbortSignal }).signal;
        unmount();
        expect(signal?.aborted).toBe(true);

        await act(async () => {
            finalResponse.resolve(verifiedExport);
            await Promise.resolve();
        });

        expect(createObjectUrl).not.toHaveBeenCalled();
        expect(anchorClick).not.toHaveBeenCalled();
    });

    it("does not create a download when a collection traversal is interrupted", async () => {
        state.fetchExport.mockRejectedValue(new MockAccountDataExportError("Collection traversal interrupted.", "EXPORT_CANCELLED"));
        const { downloadButton } = await renderAuthenticatedSettings();

        fireEvent.click(downloadButton);
        await waitFor(() => expect(state.fetchExport).toHaveBeenCalledTimes(1));

        expect(createObjectUrl).not.toHaveBeenCalled();
        expect(anchorClick).not.toHaveBeenCalled();
        expect(state.toastSuccess).not.toHaveBeenCalledWith("Data export complete");
    });
});
