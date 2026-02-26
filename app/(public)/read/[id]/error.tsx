"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

/**
 * /read/[id] — Route-level error boundary
 *
 * Shown when the content fetch (or any child component) throws an
 * unhandled exception. Offers retry and fallback navigation.
 */
export default function ReadError({ error, reset }: ErrorProps) {
    useEffect(() => {
        console.error("[ReadError]", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="inline-flex items-center justify-center size-16 rounded-full bg-destructive/15">
                    <AlertCircle className="size-7 text-destructive" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-foreground">
                        Something went wrong
                    </h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        We couldn&apos;t load this content. This might be a temporary issue
                        — try again, or head back to the library.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                        onClick={reset}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                    >
                        <RotateCcw className="size-4" />
                        Try Again
                    </button>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:bg-secondary/80 transition-colors"
                    >
                        <Home className="size-4" />
                        Back to Home
                    </Link>
                </div>

                {error.digest && (
                    <p className="text-[0.65rem] text-muted-foreground/50 font-mono">
                        Error ID: {error.digest}
                    </p>
                )}
            </div>
        </div>
    );
}
