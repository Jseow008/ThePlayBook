"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw, Home } from "lucide-react";

interface ErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function PublicError({ error, reset }: ErrorProps) {
    useEffect(() => {
        console.error("[PublicRouteError]", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="inline-flex items-center justify-center p-4 bg-destructive/10 rounded-full">
                    <AlertCircle className="size-10 text-destructive" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight">Oops, something broke</h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        We hit an unexpected snag. Try again or head back to the library.
                    </p>
                    {error.digest && (
                        <p className="text-xs text-muted-foreground/60 font-mono">
                            ID: {error.digest}
                        </p>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                        onClick={reset}
                        className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        <RotateCcw className="size-4" />
                        Try again
                    </button>
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 h-10 px-5 rounded-full border border-border text-sm font-medium hover:bg-secondary/50 transition-colors"
                    >
                        <Home className="size-4" />
                        Back to Library
                    </Link>
                </div>
            </div>
        </div>
    );
}
