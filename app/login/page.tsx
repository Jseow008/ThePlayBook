import type { Metadata } from "next";
import { AuthForm } from "@/components/ui/AuthForm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DEFAULT_LOGIN_REDIRECT_PATH, normalizeLoginNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
import { APP_NAME } from "@/lib/brand";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
    title: `Sign in or create an account - ${APP_NAME}`,
    description: "Sign in or create a Netflux account to access your library, saved summaries, notes, highlights, and personalized content.",
    alternates: {
        canonical: absoluteUrl("/login"),
    },
    robots: {
        index: false,
        follow: false,
    },
};

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams;
    const error = typeof params.error === "string" ? params.error : undefined;
    const next = normalizeLoginNextPath(typeof params.next === "string" ? params.next : undefined);
    const supabase = await createClient();
    const { user } = resolveAuthUserResult(await supabase.auth.getUser());

    if (user) {
        redirect(next);
    }

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative">
            <Link
                href={DEFAULT_LOGIN_REDIRECT_PATH}
                className="absolute top-8 left-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back
            </Link>

            <div className="w-full max-w-sm space-y-8">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div
                        aria-label="Netflux"
                        role="img"
                        className="h-14 w-14 bg-contain bg-center bg-no-repeat"
                        style={{ backgroundImage: "url('/icons/netflux-icon-borderless.png')" }}
                    />
                    <h1 className="text-3xl font-bold tracking-tight">Start your library</h1>
                    <p className="text-muted-foreground">
                        Enter your email to continue.
                    </p>
                </div>

                <div className="grid gap-4">
                    {error === "AuthCodeError" && (
                        <div className="p-3 text-sm text-red-500 bg-red-900/10 border border-red-900 rounded-md">
                            Authentication failed. Please try again.
                        </div>
                    )}
                    <AuthForm nextUrl={next} />
                </div>
            </div>
        </div>
    );
}
