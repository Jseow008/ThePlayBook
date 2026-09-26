import type { CitationLink } from "@/lib/evidence-citation";

export function EvidenceCitations({ citations }: { citations: readonly CitationLink[] }) {
    if (!citations.length) return null;
    return <nav aria-label="Supporting passages" className="not-prose mt-4 border-t border-border/60 pt-3">
        <p className="text-xs font-medium text-muted-foreground">Open verified passages</p>
        <ol className="mt-2 space-y-2 text-sm">
            {citations.map((citation, index) => <li key={citation.href}>
                <a href={citation.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
                    className="text-primary underline underline-offset-4 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                    {index + 1}. {citation.label}<span className="sr-only"> (opens in a new tab)</span>
                </a>
            </li>)}
        </ol>
    </nav>;
}
