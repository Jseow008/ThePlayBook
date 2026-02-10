"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ContentPreview } from "@/components/ui/ContentPreview";
import type { ContentItem } from "@/types/database";
import { Loader2, Shuffle } from "lucide-react";

export default function RandomPage() {
    const router = useRouter();
    const [item, setItem] = useState<ContentItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [spinning, setSpinning] = useState(false);

    const fetchRandom = useCallback(async () => {
        setSpinning(true);
        try {
            // Add a small delay for feeling
            await new Promise(r => setTimeout(r, 600));

            const res = await fetch("/api/random");
            if (!res.ok) throw new Error("Failed");

            const data = await res.json();
            setItem(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setSpinning(false);
        }
    }, []);

    useEffect(() => {
        fetchRandom();
    }, [fetchRandom]);

    if (loading && !item) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="size-10 text-primary animate-spin" />
            </div>
        );
    }

    if (!item) return null;

    return (
        <ContentPreview
            item={item}
            onSpinAgain={fetchRandom}
            isSpinning={spinning}
            title="Surprise Me"
            subtitle="Discover something new from the library"
            icon={Shuffle}
        />
    );
}
