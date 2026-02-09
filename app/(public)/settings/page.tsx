"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Trash2, Shield, HelpCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useReadingProgress } from "@/hooks/useReadingProgress";

export default function SettingsPage() {
    const router = useRouter();
    const supabase = createClient();
    const { refresh } = useReadingProgress();
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const handleSignOut = async () => {
        setIsSigningOut(true);
        await supabase.auth.signOut();
        router.push("/login"); // Redirect to login after sign out
        router.refresh();
    };

    const handleClearHistory = () => {
        if (!confirmClear) {
            setConfirmClear(true);
            setTimeout(() => setConfirmClear(false), 3000); // Reset after 3s if not confirmed
            return;
        }

        setIsClearing(true);
        // Clear all localStorage keys starting with flux_progress_
        Object.keys(localStorage).forEach((key) => {
            if (key.startsWith("flux_progress_")) {
                localStorage.removeItem(key);
            }
        });
        refresh(); // Update the hook state
        setTimeout(() => {
            setIsClearing(false);
            setConfirmClear(false);
            // Optional: Show a toast here if we had a toast system
        }, 500);
    };

    return (
        <div className="min-h-screen bg-background text-foreground pb-20">
            {/* Header */}
            <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
                <div className="container max-w-3xl mx-auto px-4 h-16 flex items-center gap-4">
                    <Link
                        href="/"
                        className="p-2 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <span className="font-semibold text-lg tracking-tight">Settings</span>
                </div>
            </div>

            <div className="container max-w-3xl mx-auto px-4 pt-10 pb-8 space-y-8">

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
                            onClick={handleClearHistory}
                            disabled={isClearing}
                            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left group"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg transition-colors ${confirmClear ? "bg-red-500/10 text-red-500" : "bg-zinc-800 rounded-lg text-zinc-400"}`}>
                                    {confirmClear ? <AlertTriangle className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className={`font-medium transition-colors ${confirmClear ? "text-red-500" : "text-foreground"}`}>
                                        {confirmClear ? "Click again to confirm" : "Clear Reading History"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {confirmClear ? "This action cannot be undone" : "Remove all progress from this device"}
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
                                <div className="p-2 bg-zinc-800 rounded-lg text-zinc-400">
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
                                <div className="p-2 bg-zinc-800 rounded-lg text-zinc-400">
                                    <HelpCircle className="w-5 h-5" />
                                </div>
                                <span className="font-medium">Terms of Service</span>
                            </div>
                        </Link>
                        <div className="p-4 text-center text-xs text-muted-foreground bg-zinc-900/30">
                            Version 1.0.0 • Flux
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
}
