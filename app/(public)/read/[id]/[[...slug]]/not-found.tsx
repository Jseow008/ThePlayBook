import Link from "next/link";

export default function UnavailableSummary() {
    return (
        <section className="mx-auto max-w-2xl space-y-4 px-6 py-12 md:py-20">
            <h1 className="text-3xl font-bold text-foreground">Summary unavailable</h1>
            <p className="text-muted-foreground">This link may be out of date, or the summary may no longer be available. Opening this page does not remove your saved reading history.</p>
            <Link href="/library/reading" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Back to library</Link>
        </section>
    );
}
