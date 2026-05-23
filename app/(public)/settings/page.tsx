"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Bell, LogOut, Trash2, Shield, HelpCircle, AlertTriangle, Download, Save, User as UserIcon, Loader2, Sparkles } from "lucide-react";
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

export default function SettingsPage() {
    const supabase = createClient();
    const { refresh, storageScope } = useReadingProgress();

    const [user, setUser] = useState<User | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const [displayName, setDisplayName] = useState("");
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [requestPublishedEmailEnabled, setRequestPublishedEmailEnabled] = useState(true);
    const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
    const [isSavingNotifications, setIsSavingNotifications] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const [isSigningOut, setIsSigningOut] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    useEffect(() => {
        let mounted = true;
        async function loadUser() {
            const { data: { user } } = await supabase.auth.getUser();
            if (mounted && user) {
                setUser(user);
                setDisplayName(user.user_metadata?.full_name || "");
            }
            if (mounted) setIsLoadingAuth(false);
        }
        loadUser();
        return () => { mounted = false; };
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

    const handleExportData = async () => {
        if (!user) return;
        setIsExporting(true);
        try {
            const [libraryRes, activityRes, feedbackRes] = await Promise.all([
                supabase.from("user_library").select("*").eq("user_id", user.id),
                supabase.from("reading_activity").select("*").eq("user_id", user.id),
                supabase.from("content_feedback").select("*").eq("user_id", user.id),
            ]);

            const exportError = libraryRes.error ?? activityRes.error ?? feedbackRes.error;
            if (exportError) {
                throw exportError;
            }

            const exportData = {
                export_date: new Date().toISOString(),
                user: { id: user.id, email: user.email, name: user.user_metadata?.full_name },
                library: libraryRes.data || [],
                activity: activityRes.data || [],
                feedback: feedbackRes.data || [],
            };

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

            toast.success("Data export complete");
        } catch (err) {
            console.error("Export error:", err);
            toast.error("Failed to export data");
        } finally {
            setIsExporting(false);
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
                const { error } = await supabase
                    .from("user_library")
                    .delete()
                    .eq("user_id", activeUser.id);

                if (error) {
                    throw error;
                }
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
                                <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                                    <LogOut className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-medium text-red-500">Sign Out</p>
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
                            onClick={handleExportData}
                            disabled={isExporting || isLoadingAuth || !user}
                            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                    {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className="font-medium text-foreground">Download My Data</p>
                                    <p className="text-sm text-muted-foreground">Export your reading history and library to a JSON file</p>
                                </div>
                            </div>
                        </button>
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
                                        {confirmClear ? "Click again to confirm" : "Clear Reading History"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {confirmClear ? "This action cannot be undone" : "Remove all progress and saved items from your account"}
                                    </p>
                                </div>
                            </div>
                        </button>
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
                                    <Sparkles className="w-5 h-5" />
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
