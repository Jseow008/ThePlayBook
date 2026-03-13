"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Chrome, Mail, Apple, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AuthFormProps {
    nextUrl?: string;
}

export function AuthForm({ nextUrl = "/" }: AuthFormProps) {
    const supabase = createClient();
    const [isLoading, setIsLoading] = useState<"google" | "apple" | "email" | null>(null);
    const [email, setEmail] = useState("");
    const [emailSent, setEmailSent] = useState(false);

    const handleOAuthLogin = async (provider: "google" | "apple") => {
        setIsLoading(provider);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=${nextUrl}`,
                },
            });

            if (error) {
                console.error(`${provider} login failed:`, error);
                toast.error(`Could not sign in with ${provider === 'google' ? 'Google' : 'Apple'}`);
                setIsLoading(null);
            }
        } catch (err) {
            console.error(`${provider} login error:`, err);
            toast.error("An unexpected error occurred");
            setIsLoading(null);
        }
    };

    const handleMagicLinkLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !email.includes("@")) {
            toast.error("Please enter a valid email address");
            return;
        }

        setIsLoading("email");

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback?next=${nextUrl}`,
                },
            });

            if (error) {
                console.error("Magic link failed:", error);
                toast.error(error.message || "Failed to send magic link");
            } else {
                setEmailSent(true);
                toast.success("Magic link sent! Check your email.");
            }
        } catch (err) {
            console.error("Magic link error:", err);
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(null);
        }
    };

    if (emailSent) {
        return (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 bg-secondary/20 border border-border/50 rounded-xl animate-in fade-in zoom-in-95">
                <div className="p-3 bg-primary/10 rounded-full">
                    <Mail className="w-6 h-6 text-primary" />
                </div>
                <div className="space-y-1">
                    <h3 className="font-semibold text-foreground">Check your email</h3>
                    <p className="text-sm text-muted-foreground">
                        We sent a magic link to <span className="font-medium text-foreground">{email}</span>
                    </p>
                </div>
                <Button
                    variant="outline"
                    className="mt-4 w-full"
                    onClick={() => setEmailSent(false)}
                >
                    Try another email
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Email Magic Link Form */}
            <form onSubmit={handleMagicLinkLogin} className="flex flex-col gap-3">
                <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-foreground">
                        Email address
                    </label>
                    <div className="relative">
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isLoading !== null}
                            required
                        />
                    </div>
                </div>

                <Button
                    type="submit"
                    className="w-full h-11 font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={isLoading !== null}
                >
                    {isLoading === "email" ? (
                        <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            Continue with Email
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                    )}
                </Button>
            </form>

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-3 text-muted-foreground font-medium">
                        Or continue with
                    </span>
                </div>
            </div>

            {/* Social Oauth Buttons */}
            <div className="flex flex-col gap-3">
                <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 relative bg-background hover:bg-secondary/50 border-input transition-colors"
                    onClick={() => handleOAuthLogin("google")}
                    disabled={isLoading !== null}
                >
                    {isLoading === "google" ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : null}
                    <Chrome className={cn("mr-2 h-4 w-4", isLoading !== null && "opacity-50")} />
                    <span className={cn(isLoading !== null && "opacity-50")}>Sign in with Google</span>
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 relative bg-background hover:bg-secondary/50 border-input transition-colors"
                    onClick={() => handleOAuthLogin("apple")}
                    disabled={isLoading !== null}
                >
                    {isLoading === "apple" ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : null}
                    <Apple className={cn("mr-2 h-5 w-5", isLoading !== null && "opacity-50")} />
                    <span className={cn(isLoading !== null && "opacity-50")}>Sign in with Apple</span>
                </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground px-4 leading-relaxed">
                By continuing, you agree to our{" "}
                <a href="/terms" className="underline underline-offset-2 hover:text-foreground">Terms of Service</a>
                {" "}and{" "}
                <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</a>.
            </p>
        </div>
    );
}
