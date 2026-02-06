"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Chrome } from "lucide-react";
import { useState } from "react";

export function LoginButton({
    nextUrl = "/",
}: {
    nextUrl?: string;
}) {
    const [isLoading, setIsLoading] = useState(false);
    const supabase = createClient();

    const handleLogin = async () => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=${nextUrl}`,
                },
            });

            if (error) {
                console.error("Login failed:", error);
            }
        } catch (err) {
            console.error("Login error:", err);
        } finally {
            // Usually redirects, but stop loading if something failed immediately
            // setIsLoading(false);
        }
    };

    return (
        <Button
            variant="outline"
            className="w-full relative"
            onClick={handleLogin}
            disabled={isLoading}
        >
            {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
            ) : null}
            <Chrome className="mr-2 h-4 w-4" />
            Sign in with Google
        </Button>
    );
}
