"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Chrome, Mail, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { DEFAULT_LOGIN_REDIRECT_PATH } from "@/lib/auth-redirect";

interface AuthFormProps {
    nextUrl?: string;
}

function isEmailSignupUnavailableError(error: { message?: string; code?: string; status?: number }) {
    const message = error.message?.toLowerCase() ?? "";

    return (
        error.status === 422
        || error.code === "otp_disabled"
        || message.includes("signups not allowed")
        || message.includes("user not found")
        || message.includes("not found")
    );
}

export function AuthForm({ nextUrl = DEFAULT_LOGIN_REDIRECT_PATH }: AuthFormProps) {
    const supabase = createClient();
    const [isLoading, setIsLoading] = useState<"google" | "email" | null>(null);
    const [email, setEmail] = useState("");
    const [emailSent, setEmailSent] = useState(false);
    const [code, setCode] = useState("");

    const buildCallbackUrl = () => {
        const callbackUrl = new URL("/auth/callback", window.location.origin);
        callbackUrl.searchParams.set("next", nextUrl);
        return callbackUrl.toString();
    };

    const handleOAuthLogin = async (provider: "google") => {
        setIsLoading(provider);
        captureAnalyticsEvent("signup_started", {
            source: "auth_form",
            auth_method: provider,
            route: "/login",
            user_state: "anonymous",
        });

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: buildCallbackUrl(),
                },
            });

            if (error) {
                console.error(`${provider} login failed:`, error);
                toast.error("Could not sign in with Google");
                setIsLoading(null);
            }
        } catch (err) {
            console.error(`${provider} login error:`, err);
            toast.error("An unexpected error occurred");
            setIsLoading(null);
        }
    };

    const handleEmailCodeRequest = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const normalizedEmail = email.trim();

        if (!normalizedEmail || !normalizedEmail.includes("@")) {
            toast.error("Please enter a valid email address");
            return;
        }

        setIsLoading("email");
        captureAnalyticsEvent("signup_started", {
            source: "auth_form",
            auth_method: "email",
            route: "/login",
            user_state: "anonymous",
        });

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: normalizedEmail,
                options: { shouldCreateUser: true },
            });

            if (error) {
                console.error("Email code request failed:", error);
                toast.error(
                    isEmailSignupUnavailableError(error)
                        ? "Email sign-up is unavailable right now. Please try Google or try again later."
                        : error.message || "Failed to send verification code"
                );
            } else {
                setEmailSent(true);
                setEmail(normalizedEmail);
                toast.success("Verification code sent! Check your email.");
            }
        } catch (err) {
            console.error("Email code request error:", err);
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(null);
        }
    };

    const handleCodeVerification = async (e: React.FormEvent) => {
        e.preventDefault();

        const normalizedCode = code.trim();

        if (!normalizedCode) {
            toast.error("Enter the verification code from your email");
            return;
        }

        setIsLoading("email");

        try {
            const response = await fetch("/api/auth/otp/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, token: normalizedCode, next: nextUrl }),
            });
            const result = await response.json().catch(() => null) as { error?: string; next?: string } | null;

            if (!response.ok) {
                toast.error(result?.error || "That code is invalid or has expired. Please try again.");
                return;
            }

            window.location.assign(result?.next || nextUrl);
        } catch (err) {
            console.error("Email code verification error:", err);
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(null);
        }
    };

    if (emailSent) {
        return (
            <form onSubmit={handleCodeVerification} className="flex flex-col items-center justify-center p-6 text-center space-y-4 bg-secondary/20 border border-border/50 rounded-xl animate-in fade-in zoom-in-95">
                <div className="p-3 bg-primary/10 rounded-full">
                    <Mail className="w-6 h-6 text-primary" />
                </div>
                <div className="space-y-1">
                    <h3 className="font-semibold text-foreground">Enter your code</h3>
                    <p className="text-sm text-muted-foreground">
                        We sent a verification code to <span className="font-medium text-foreground">{email}</span>
                    </p>
                </div>
                <input
                    aria-label="Verification code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={8}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    value={code}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-center font-medium tracking-[0.35em] text-sm ring-offset-background placeholder:tracking-[0.35em] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isLoading !== null}
                    required
                />
                <Button
                    type="submit"
                    className="w-full h-11 font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={isLoading !== null || !code}
                >
                    {isLoading === "email" ? "Verifying…" : "Verify and continue"}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleEmailCodeRequest}
                    disabled={isLoading !== null}
                >
                    Resend code
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={() => {
                        setCode("");
                        setEmailSent(false);
                    }}
                    disabled={isLoading !== null}
                >
                    Use another email
                </Button>
            </form>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Email verification code form */}
            <form onSubmit={handleEmailCodeRequest} className="flex flex-col gap-3">
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
