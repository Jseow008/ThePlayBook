import Link from "next/link";
import { buildReadPath } from "@/lib/content-paths";

export function ContentReplacementNotice({ sourceId, sourceTitle, replacement }: {
    sourceId: string;
    sourceTitle: string;
    replacement: { id: string; title: string };
}) {
    return (
        <section className="mx-auto w-full max-w-2xl space-y-5 px-6 py-12 md:py-20" aria-labelledby="replacement-title">
            <p className="text-sm text-muted-foreground">{sourceTitle}</p>
            <h1 id="replacement-title" className="text-3xl font-bold text-foreground">This summary has been replaced</h1>
            <p className="text-muted-foreground">The current summary is “{replacement.title}”. Saved history, notes and highlights remain attached to the original version.</p>
            <p className="text-muted-foreground">Reading and listening positions are separate for each version. Opening the replacement keeps any progress you already have there.</p>
            <div className="flex flex-wrap gap-4">
                <Link href={buildReadPath(replacement)} className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-medium text-primary-foreground">Open updated summary</Link>
                <Link href={`/notes?item=${encodeURIComponent(sourceId)}`} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">View original notes</Link>
                <Link href="/library/reading" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4">Back to library</Link>
            </div>
        </section>
    );
}
