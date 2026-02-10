import { LoginButton } from "@/components/ui/LoginButton";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const { error } = await searchParams;
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative">
            <Link
                href="/"
                className="absolute top-8 left-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Home
            </Link>

            <div className="w-full max-w-sm space-y-8">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="p-3 bg-primary/10 rounded-full">
                        <BookOpen className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
                    <p className="text-muted-foreground">
                        Sign in to access your library and personalized content.
                    </p>
                </div>

                <div className="grid gap-4">
                    {error === "AuthCodeError" && (
                        <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900 rounded-md">
                            Authentication failed. Please try again.
                        </div>
                    )}
                    <LoginButton />

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                Or
                            </span>
                        </div>
                    </div>

                    <p className="text-xs text-center text-muted-foreground">
                        More sign-in options coming soon.
                    </p>
                </div>
            </div>
        </div>
    );
}
