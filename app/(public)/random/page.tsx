"use client";

/**
 * Surprise Me Page
 * 
 * Fetches a random published content item and redirects to its preview page.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shuffle } from "lucide-react";

export default function RandomPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchRandomContent() {
            try {
                const response = await fetch("/api/random");
                const data = await response.json();

                if (data.id) {
                    router.replace(`/preview/${data.id}`);
                } else {
                    setError("No content available yet.");
                }
            } catch (e) {
                console.error("Failed to fetch random content", e);
                setError("Failed to load. Please try again.");
            }
        }

        fetchRandomContent();
    }, [router]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                {error ? (
                    <>
                        <p className="text-muted-foreground text-lg mb-4">{error}</p>
                        <button
                            onClick={() => router.push("/")}
                            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                        >
                            Go Home
                        </button>
                    </>
                ) : (
                    <>
                        <Shuffle className="size-16 text-primary mx-auto mb-4 animate-pulse" />
                        <p className="text-muted-foreground text-lg">Finding something good...</p>
                    </>
                )}
            </div>
        </div>
    );
}
