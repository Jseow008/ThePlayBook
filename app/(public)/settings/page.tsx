"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Bell, LogOut, Trash2, Shield, HelpCircle, AlertTriangle, Download, Save, User as UserIcon, Loader2, CirclePlay } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import Link from "next/link";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { APP_NAME } from "@/lib/brand";
import { APP_ONBOARDING_QUERY_PARAM, APP_ONBOARDING_REPLAY_VALUE } from "@/lib/onboarding";
import { clearScopedReadingHistory } from "@/lib/local-user-storage";
import { clearCachedRecommendations, clearRecentRecommendations } from "@/lib/recommendation-memory";
import { clearCachedBrowseRecommendations } from "@/lib/browse-recommendation-cache";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { AccountDataExportError, fetchVerifiedAccountDataExport, type AccountDataExportProgress } from "@/lib/account-data-export-client";
import { ACCOUNT_DATA_EXPORT_COLLECTIONS } from "@/lib/account-data-snapshot-collections";

type ActiveExport = {
    accountId: string;
    sessionId: string;
    authGeneration: number;
    controller: AbortController;
};

type VisibleExportProgress = AccountDataExportProgress | {
    phase: "saving";
    completedCollections: number;
    totalCollections: number;
    completedRecords: number;
    totalRecords: number;
};

const RESUMABLE_ACCOUNT_EXPORT_STORAGE_KEY = "netflux.account-data-export.resume.v1";

function readResumableExportSnapshotId() {
    try {
        const snapshotId = window.sessionStorage.getItem(RESUMABLE_ACCOUNT_EXPORT_STORAGE_KEY);
        return snapshotId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(snapshotId) ? snapshotId : null;
    } catch {
        return null;
    }
}

function writeResumableExportSnapshotId(snapshotId: string) {
    try {
        window.sessionStorage.setItem(RESUMABLE_ACCOUNT_EXPORT_STORAGE_KEY, snapshotId);
    } catch {
        // Resume is optional; exporting still works when browser storage is unavailable.
    }
}

function clearResumableExportSnapshotId() {
    try {
        window.sessionStorage.removeItem(RESUMABLE_ACCOUNT_EXPORT_STORAGE_KEY);
    } catch {
        // Nothing to clear when browser storage is unavailable.
    }
}

function exportProgressMessage(progress: VisibleExportProgress) {
    if (progress.phase === "preparing") return "Preparing a complete snapshot of your data…";
    if (progress.phase === "downloading") return `Downloading ${progress.completedCollections} of ${progress.totalCollections} data categories…`;
    if (progress.phase === "verifying") return `Verifying ${progress.completedRecords} of ${progress.totalRecords} records…`;
    return "Creating your JSON file…";
}

function waitForBrowserPaint() {
    return new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
}

export default function SettingsPage() {
    const supabase = createClient();
    const { refresh, storageScope } = useReadingProgress();
    const queryClient = useQueryClient();

    const [user, setUser] = useState<User | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const [displayName, setDisplayName] = useState("");
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [requestPublishedEmailEnabled, setRequestPublishedEmailEnabled] = useState(true);
    const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
    const [isSavingNotifications, setIsSavingNotifications] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState<VisibleExportProgress | null>(null);
    const [resumableExportSnapshotId, setResumableExportSnapshotId] = useState<string | null>(null);
    const [resumeUnavailable, setResumeUnavailable] = useState(false);
    const authenticatedAccountRef = useRef<string | null>(null);
    const authenticatedSessionRef = useRef<string | null>(null);
    const authGenerationRef = useRef(0);
    const authResolutionSequenceRef = useRef(0);
    const hasResolvedInitialAuthRef = useRef(false);
    const activeExportRef = useRef<ActiveExport | null>(null);

    const [isSigningOut, setIsSigningOut] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [isDeletingNotes, setIsDeletingNotes] = useState(false);
    const [isConfirmingNotesDeletion, setIsConfirmingNotesDeletion] = useState(false);
    const [notesDeletionConfirmation, setNotesDeletionConfirmation] = useState("");

    useEffect(() => {
        setResumableExportSnapshotId(readResumableExportSnapshotId());
    }, []);

    useEffect(() => {
        let mounted = true;

        const cancelActiveExport = () => {
            const activeExport = activeExportRef.current;
            if (!activeExport) return;
            activeExport.controller.abort();
            activeExportRef.current = null;
            if (mounted) {
                setIsExporting(false);
                setExportProgress(null);
            }
        };

        const applyAuthenticatedUser = async (nextUser: User | null, resolutionSequence: number) => {
            if (!mounted || resolutionSequence !== authResolutionSequenceRef.current) return;
            let nextAccountId: string | null = null;
            let nextSessionId: string | null = null;

            if (nextUser) {
                // Verify the current token's claims instead of trusting the
                // user object carried by a browser auth event. `session_id`
                // stays stable across ordinary refreshes but changes on a
                // replacement login for the same account.
                try {
                    const { data, error } = await supabase.auth.getClaims();
                    const claims = data?.claims;
                    if (!error && claims?.sub === nextUser.id && typeof claims.session_id === "string") {
                        nextAccountId = nextUser.id;
                        nextSessionId = claims.session_id;
                    }
                } catch {
                    // Treat an unavailable or unverifiable token as signed out.
                }
            }

            // A previous refresh can finish after logout or a newer login.
            // Only the latest requested resolution is allowed to commit state.
            if (!mounted || resolutionSequence !== authResolutionSequenceRef.current) return;
            const accountChanged = authenticatedAccountRef.current !== nextAccountId;
            const sessionChanged = !accountChanged
                && authenticatedSessionRef.current !== null
                && authenticatedSessionRef.current !== nextSessionId;
            // A token refresh preserves the same session ID and can continue.
            // Losing the account, switching accounts, or replacing a session
            // starts a new generation and makes an earlier export unsafe.
            if (accountChanged || sessionChanged) {
                const isInitialAuthentication = !hasResolvedInitialAuthRef.current && authenticatedAccountRef.current === null;
                authGenerationRef.current += 1;
                authenticatedAccountRef.current = nextAccountId;
                authenticatedSessionRef.current = nextSessionId;
                cancelActiveExport();
                if (!isInitialAuthentication) {
                    clearResumableExportSnapshotId();
                    setResumableExportSnapshotId(null);
                }
            } else {
                authenticatedSessionRef.current = nextSessionId;
            }
            setUser(nextAccountId ? nextUser : null);
            setDisplayName(nextAccountId ? nextUser?.user_metadata?.full_name || "" : "");
            hasResolvedInitialAuthRef.current = true;
            setIsLoadingAuth(false);
        };

        async function loadUser() {
            const resolutionSequence = ++authResolutionSequenceRef.current;
            try {
                const { data: { user } } = await supabase.auth.getUser();
                await applyAuthenticatedUser(user, resolutionSequence);
            } catch {
                await applyAuthenticatedUser(null, resolutionSequence);
            }
        }

        loadUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const resolutionSequence = ++authResolutionSequenceRef.current;
            void applyAuthenticatedUser(session?.user ?? null, resolutionSequence);
        });

        return () => {
            mounted = false;
            authGenerationRef.current += 1;
            authResolutionSequenceRef.current += 1;
            const activeExport = activeExportRef.current;
            if (activeExport) {
                activeExport.controller.abort();
                activeExportRef.current = null;
            }
            subscription.unsubscribe();
        };
    }, [supabase]);

    useEffect(() => {
        if (!user) return;

        let mounted = true;
        async function loadNotificationPreferences() {
            setIsLoadingNotifications(true);
            try {
                const response = await fetch("/api/notification-preferences");
                if (!response.ok) {
                    throw new Error("Failed to load notification preferences");
                }
                const payload = await response.json() as {
                    data?: { request_published_email_enabled?: boolean };
                };
                if (mounted) {
                    setRequestPublishedEmailEnabled(payload.data?.request_published_email_enabled ?? true);
                }
            } catch (error) {
                console.error("Notification preferences error:", error);
                if (mounted) {
                    toast.error("Could not load notification preferences");
                }
            } finally {
                if (mounted) {
                    setIsLoadingNotifications(false);
                }
            }
        }

        loadNotificationPreferences();
        return () => { mounted = false; };
    }, [user]);

    const handleSaveProfile = async () => {
        if (!user) return;
        setIsSavingProfile(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: { full_name: displayName }
            });
            if (error) throw error;
            toast.success("Profile updated successfully");
            setUser(prev => prev ? { ...prev, user_metadata: { ...prev.user_metadata, full_name: displayName } } : null);
        } catch (err: any) {
            toast.error(err.message || "Failed to update profile");
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleExportData = async (resumeSnapshotId?: string) => {
        if (!user) return;
        const activeExport: ActiveExport = {
            accountId: user.id,
            sessionId: authenticatedSessionRef.current ?? "",
            authGeneration: authGenerationRef.current,
            controller: new AbortController(),
        };
        if (!activeExport.sessionId) return;
        activeExportRef.current = activeExport;
        setIsExporting(true);
        setExportProgress({
            phase: "preparing",
            completedCollections: 0,
            totalCollections: ACCOUNT_DATA_EXPORT_COLLECTIONS.length,
            completedRecords: 0,
            totalRecords: null,
        });
        const exportStartedAt = performance.now();

        const ensureExportIsCurrent = () => {
            if (
                activeExport.controller.signal.aborted
                || activeExportRef.current !== activeExport
                || authenticatedAccountRef.current !== activeExport.accountId
                || authenticatedSessionRef.current !== activeExport.sessionId
                || authGenerationRef.current !== activeExport.authGeneration
            ) {
                throw new AccountDataExportError("The data export was cancelled because the signed-in account changed.", "EXPORT_CANCELLED");
            }
        };

        const updateExportProgress = (progress: AccountDataExportProgress) => {
            if (
                activeExport.controller.signal.aborted
                || activeExportRef.current !== activeExport
                || authenticatedAccountRef.current !== activeExport.accountId
                || authenticatedSessionRef.current !== activeExport.sessionId
                || authGenerationRef.current !== activeExport.authGeneration
            ) return;
            setExportProgress(progress);
        };

        try {
            const exportData = await fetchVerifiedAccountDataExport({
                signal: activeExport.controller.signal,
                onProgress: updateExportProgress,
                resumeSnapshotId,
                onSnapshotReady: ({ snapshotId }) => {
                    if (activeExportRef.current !== activeExport || activeExport.controller.signal.aborted) return;
                    writeResumableExportSnapshotId(snapshotId);
                    setResumableExportSnapshotId(snapshotId);
                    setResumeUnavailable(false);
                },
            });
            ensureExportIsCurrent();

            // Auth events are asynchronous. Confirm both the server-authenticated
            // account and session immediately before producing a browser download.
            const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
            const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
            const claims = claimsData?.claims;
            if (
                authError
                || claimsError
                || currentUser?.id !== activeExport.accountId
                || claims?.sub !== activeExport.accountId
                || claims?.session_id !== activeExport.sessionId
            ) {
                throw new AccountDataExportError("The data export was cancelled because the signed-in account changed.", "EXPORT_CANCELLED");
            }
            ensureExportIsCurrent();

            setExportProgress({
                phase: "saving",
                completedCollections: ACCOUNT_DATA_EXPORT_COLLECTIONS.length,
                totalCollections: ACCOUNT_DATA_EXPORT_COLLECTIONS.length,
                completedRecords: exportData.snapshot.collection_manifests
                    ? Object.values(exportData.snapshot.collection_manifests).reduce((total, collection) => total + collection.recordCount, 0)
                    : 0,
                totalRecords: exportData.snapshot.collection_manifests
                    ? Object.values(exportData.snapshot.collection_manifests).reduce((total, collection) => total + collection.recordCount, 0)
                    : 0,
            });
            await waitForBrowserPaint();
            ensureExportIsCurrent();
            const fileCreationStartedAt = performance.now();
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const safeName = APP_NAME.toLowerCase().replace(/\s+/g, '-');
            a.download = `${safeName}-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            clearResumableExportSnapshotId();
            setResumableExportSnapshotId(null);
            setResumeUnavailable(false);

            const fileCreationMs = performance.now() - fileCreationStartedAt;
            captureAnalyticsEvent("account_data_export_completed", {
                source: "settings",
                snapshot_preparation_ms: Math.round(exportData.timings.snapshotPreparationMs),
                collection_retrieval_ms: Math.round(exportData.timings.collectionRetrievalMs),
                verification_ms: Math.round(exportData.timings.verificationMs),
                file_creation_ms: Math.round(fileCreationMs),
                total_ms: Math.round(performance.now() - exportStartedAt),
            });
            toast.success("Data export complete");
        } catch (err) {
            if (err instanceof AccountDataExportError && err.code === "EXPORT_CANCELLED") {
                return;
            }
            if (
                resumeSnapshotId
                && err instanceof AccountDataExportError
                && ["NOT_FOUND", "EXPIRED", "INVALIDATED", "UNAUTHORIZED", "FORBIDDEN"].includes(err.code)
            ) {
                clearResumableExportSnapshotId();
                setResumableExportSnapshotId(null);
                setResumeUnavailable(true);
            }
            console.error("Export error:", err);
            toast.error(err instanceof AccountDataExportError ? err.message : "Failed to export data");
        } finally {
            if (activeExportRef.current === activeExport) {
                activeExportRef.current = null;
                setIsExporting(false);
                setExportProgress(null);
            }
        }
    };

    const handleToggleRequestPublishedEmails = async () => {
        if (!user || isSavingNotifications) return;

        const nextValue = !requestPublishedEmailEnabled;
        setIsSavingNotifications(true);
        setRequestPublishedEmailEnabled(nextValue);

        try {
            const response = await fetch("/api/notification-preferences", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ request_published_email_enabled: nextValue }),
            });

            if (!response.ok) {
                throw new Error("Failed to update notification preferences");
            }

            const payload = await response.json() as {
                data?: { request_published_email_enabled?: boolean };
            };
            setRequestPublishedEmailEnabled(payload.data?.request_published_email_enabled ?? nextValue);
            toast.success("Notification preferences updated");
        } catch (error) {
            console.error("Notification preferences update error:", error);
            setRequestPublishedEmailEnabled(!nextValue);
            toast.error("Could not update notification preferences");
        } finally {
            setIsSavingNotifications(false);
        }
    };

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;

            await signOutAction();
        } catch (err: any) {
            toast.error(err?.message || "Failed to sign out");
            setIsSigningOut(false);
        }
    };

    const handleClearHistory = async () => {
        if (!confirmClear) {
            setConfirmClear(true);
            setTimeout(() => setConfirmClear(false), 3000); // Reset after 3s if not confirmed
            return;
        }

        setIsClearing(true);
        try {
            const { data: { user: authenticatedUser }, error: authError } = await supabase.auth.getUser();
            if (authError) {
                throw authError;
            }

            const activeUser = authenticatedUser ?? user;

            if (activeUser) {
                const response = await fetch("/api/account-data/reset", { method: "POST" });
                const payload = await response.json().catch(() => null) as {
                    data?: { resetEpoch?: number; currentRevision?: number };
                    error?: { message?: string };
                } | null;
                if (!response.ok) throw new Error(payload?.error?.message || "Failed to reset library");
                const reset = payload?.data ?? null;
                window.dispatchEvent(new CustomEvent("netflux_library_reset", {
                    detail: {
                        scope: storageScope,
                        resetEpoch: typeof reset?.resetEpoch === "number" ? reset.resetEpoch : null,
                        boundaryRevision: typeof reset?.currentRevision === "number" ? reset.currentRevision : null,
                    },
                }));
            }

            clearScopedReadingHistory(localStorage, storageScope);
            clearRecentRecommendations(localStorage, storageScope);
            clearCachedRecommendations(localStorage, storageScope);
            clearCachedBrowseRecommendations(localStorage, storageScope);
            refresh();
            setConfirmClear(false);
            toast.success("Reading history cleared");
        } catch (err: any) {
            toast.error(err?.message || "Failed to clear reading history");
        } finally {
            setIsClearing(false);
        }
    };

    const handleDeleteNotesAndHighlights = async () => {
        if (!isConfirmingNotesDeletion) {
            setIsConfirmingNotesDeletion(true);
            return;
        }

        if (notesDeletionConfirmation !== "DELETE") return;

        setIsDeletingNotes(true);
        try {
            const response = await fetch("/api/library/highlights", { method: "DELETE" });
            const payload = await response.json() as {
                deletedCount?: number;
                error?: { message?: string };
            };

            if (!response.ok) {
                throw new Error(payload.error?.message || "Failed to delete notes and highlights");
            }

            await queryClient.invalidateQueries({ queryKey: ["highlights"] });
            setIsConfirmingNotesDeletion(false);
            setNotesDeletionConfirmation("");

            const deletedCount = payload.deletedCount ?? 0;
            toast.success(
                deletedCount === 1
                    ? "Deleted 1 note or highlight"
                    : `Deleted ${deletedCount} notes and highlights`
            );
        } catch (err: any) {
            toast.error(err?.message || "Failed to delete notes and highlights");
        } finally {
            setIsDeletingNotes(false);
        }
    };

    const cancelNotesAndHighlightsDeletion = () => {
        if (isDeletingNotes) return;
        setIsConfirmingNotesDeletion(false);
        setNotesDeletionConfirmation("");
    };

    return (
        <div className="min-h-screen bg-background pb-8 lg:pb-24">
            <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12 space-y-8">
                <div>


                    <h1 className="text-3xl font-bold text-foreground font-display tracking-tight leading-tight">
                        Settings
                    </h1>
                </div>

                {/* Profile Section */}
                <section className="space-y-4">
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
                        Profile
                    </h2>
                    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                        {isLoadingAuth ? (
                            <div className="flex justify-center p-4">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : user ? (
                            <>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Email (Read-only)</label>
                                    <input
                                        type="email"
                                        value={user.email || ""}
                                        disabled
                                        className="w-full flex h-10 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Display Name</label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                <UserIcon className="w-4 h-4 text-muted-foreground" />
                                            </div>
                                            <input
                                                type="text"
                                                value={displayName}
                                                onChange={(e) => setDisplayName(e.target.value)}
                                                placeholder="e.g. Reader 1"
                                                className="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                        </div>
                                        <button
                                            onClick={handleSaveProfile}
                                            disabled={isSavingProfile || displayName === (user.user_metadata?.full_name || "")}
                                            className="h-10 px-4 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground font-medium text-sm transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            <span className="ml-2 hidden sm:inline">Save</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">Not signed in.</p>
                        )}
                    </div>
                </section>

                {/* Notifications Section */}
                <section className="space-y-4">
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
                        Notifications
                    </h2>
                    <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={requestPublishedEmailEnabled}
                            onClick={handleToggleRequestPublishedEmails}
                            disabled={isLoadingAuth || isLoadingNotifications || isSavingNotifications || !user}
                            className="w-full flex items-center justify-between gap-4 p-4 hover:bg-accent/50 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    {isLoadingNotifications || isSavingNotifications
                                        ? <Loader2 className="w-5 h-5 animate-spin" />
                                        : <Bell className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className="font-medium text-foreground">Request published emails</p>
                                    <p className="text-sm text-muted-foreground">
                                        Get a transactional email when a summary you requested or voted for goes live.
                                    </p>
                                </div>
                            </div>
                            <span
                                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
                                    requestPublishedEmailEnabled
                                        ? "border-primary bg-primary"
                                        : "border-border bg-muted"
                                }`}
                            >
                                <span
                                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                                        requestPublishedEmailEnabled ? "translate-x-5" : "translate-x-0.5"
                                    }`}
                                />
                            </span>
                        </button>
                    </div>
                </section>


                {/* Account Section */}
                <section className="space-y-4">
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
                        Account
                    </h2>
                    <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                        <button
                            onClick={handleSignOut}
                            disabled={isSigningOut}
                            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-secondary rounded-lg text-muted-foreground">
                                    <LogOut className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-medium text-foreground">Sign Out</p>
                                    <p className="text-sm text-muted-foreground">Log out of your account</p>
                                </div>
                            </div>
                            {isSigningOut && <span className="text-xs text-muted-foreground animate-pulse">Signing out...</span>}
                        </button>
                    </div>
                </section>

                {/* Data Management Section */}
                <section className="space-y-4">
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
                        Data Management
                    </h2>
                    <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                        <button
                            onClick={() => handleExportData(resumableExportSnapshotId ?? undefined)}
                            disabled={isExporting || isLoadingAuth || !user}
                            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                    {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className="font-medium text-foreground">
                                        {resumableExportSnapshotId ? "Resume data export" : resumeUnavailable ? "Start a new export" : "Download My Data"}
                                    </p>
                                    <p className="text-sm text-muted-foreground" aria-live="polite">
                                        {exportProgress
                                            ? exportProgressMessage(exportProgress)
                                            : resumableExportSnapshotId
                                                ? "Finish downloading your existing verified export without using another export request"
                                                : resumeUnavailable
                                                    ? "The previous export is no longer available. Create a new verified export."
                                                    : "Export your library, reading history, notes, reflections, preferences, and request activity to a JSON file"}
                                    </p>
                                </div>
                            </div>
                        </button>
                        {resumableExportSnapshotId && !isExporting && (
                            <button
                                onClick={() => {
                                    clearResumableExportSnapshotId();
                                    setResumableExportSnapshotId(null);
                                    setResumeUnavailable(false);
                                    void handleExportData();
                                }}
                                className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-secondary rounded-lg text-muted-foreground">
                                        <Download className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-foreground">Start a new export</p>
                                        <p className="text-sm text-muted-foreground">Discard this export reference and create a new snapshot.</p>
                                    </div>
                                </div>
                            </button>
                        )}
                        <button
                            onClick={handleClearHistory}
                            disabled={isClearing || isLoadingAuth}
                            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left group"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg transition-colors ${confirmClear ? "bg-red-500/10 text-red-500" : "bg-secondary text-muted-foreground"}`}>
                                    {confirmClear ? <AlertTriangle className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className={`font-medium transition-colors ${confirmClear ? "text-red-500" : "text-foreground"}`}>
                                        {confirmClear ? "Click again to confirm" : "Clear Reading History & Library"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {confirmClear ? "This action cannot be undone; notes and highlights are kept" : "Remove all progress and saved library items. Notes and highlights are kept."}
                                    </p>
                                </div>
                            </div>
                        </button>
                        <button
                            onClick={handleDeleteNotesAndHighlights}
                            disabled={isDeletingNotes || isLoadingAuth || !user}
                            className={`w-full flex items-center justify-between p-4 transition-colors text-left disabled:cursor-not-allowed disabled:opacity-50 ${isConfirmingNotesDeletion ? "hover:bg-red-500/5" : "hover:bg-accent/50"}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg transition-colors ${isConfirmingNotesDeletion ? "bg-red-500/10 text-red-500" : "bg-secondary text-muted-foreground"}`}>
                                    {isDeletingNotes ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className={`font-medium transition-colors ${isConfirmingNotesDeletion ? "text-red-500" : "text-foreground"}`}>Delete All Notes & Highlights</p>
                                    <p className="text-sm text-muted-foreground">Permanently delete every saved highlight and written note</p>
                                </div>
                            </div>
                        </button>
                        {isConfirmingNotesDeletion && (
                            <div className="space-y-3 bg-red-500/5 p-4">
                                <p className="text-sm text-foreground">
                                    This permanently deletes all notes and highlights. Type <span className="font-semibold">DELETE</span> to confirm.
                                </p>
                                <label className="sr-only" htmlFor="notes-deletion-confirmation">Type DELETE to confirm</label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <input
                                        id="notes-deletion-confirmation"
                                        type="text"
                                        value={notesDeletionConfirmation}
                                        onChange={(event) => setNotesDeletionConfirmation(event.target.value)}
                                        placeholder="Type DELETE"
                                        autoComplete="off"
                                        className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleDeleteNotesAndHighlights}
                                        disabled={isDeletingNotes || notesDeletionConfirmation !== "DELETE"}
                                        className="h-10 rounded-md bg-red-500 px-4 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isDeletingNotes ? "Deleting..." : "Delete permanently"}
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={cancelNotesAndHighlightsDeletion}
                                    disabled={isDeletingNotes}
                                    className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                {/* About Section */}
                <section className="space-y-4">
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
                        About
                    </h2>
                    <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                        <Link
                            href="/privacy"
                            className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-secondary rounded-lg text-muted-foreground">
                                    <Shield className="w-5 h-5" />
                                </div>
                                <span className="font-medium">Privacy Policy</span>
                            </div>
                        </Link>
                        <Link
                            href="/terms"
                            className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-secondary rounded-lg text-muted-foreground">
                                    <HelpCircle className="w-5 h-5" />
                                </div>
                                <span className="font-medium">Terms of Service</span>
                            </div>
                        </Link>
                        <Link
                            href={`/browse?${APP_ONBOARDING_QUERY_PARAM}=${APP_ONBOARDING_REPLAY_VALUE}`}
                            className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-secondary rounded-lg text-muted-foreground">
                                    <CirclePlay className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-medium">Replay app tour</p>
                                    <p className="text-sm text-muted-foreground">Open the guided introduction again from the home feed.</p>
                                </div>
                            </div>
                        </Link>
                        <div className="p-4 text-center text-xs text-muted-foreground bg-secondary/30">
                            Version 1.0.0 • {APP_NAME}
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
}
