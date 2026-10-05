import Link from "next/link";
import { Headphones } from "lucide-react";
import { buildReadPath } from "@/lib/content-paths";

export function AudioListenLink({ item }: { item: { id: string; title: string; audio_url?: string | null } }) {
    if (!item.audio_url?.trim()) return null;

    return (
        <Link
            href={`${buildReadPath(item)}#audio-player`}
            aria-label={`Listen to ${item.title}`}
            className="focus-ring touch-target-44 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border/70 bg-secondary/30 px-3 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-secondary/60"
        >
            <Headphones className="size-4" aria-hidden="true" />
            <span>Listen</span>
        </Link>
    );
}
