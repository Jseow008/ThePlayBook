"use client";

/**
 * Admin Logout Button
 * 
 * Client component for handling logout action.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AdminLogoutButton() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogout = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/admin/logout", { method: "POST" });
            if (!response.ok) {
                throw new Error("Logout failed. Please try again.");
            }

            const supabase = createClient();
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) {
                throw signOutError;
            }

            router.push("/admin-login");
            router.refresh();
        } catch (error) {
            console.error("Logout error:", error);
            setError(error instanceof Error ? error.message : "Logout failed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <button
                onClick={handleLogout}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
                {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <LogOut className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Logout</span>
            </button>
            {error ? (
                <p className="max-w-48 text-right text-xs font-medium text-red-600" role="alert">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
