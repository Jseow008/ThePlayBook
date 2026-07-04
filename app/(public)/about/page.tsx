/**
 * About Page
 *
 * Information about ${APP_NAME} and its mission.
 * Lives inside the (public) layout for consistent sidebar/nav chrome.
 */

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { CompactPublicFooter } from "@/components/ui/CompactPublicFooter";

export const metadata = {
    title: `About | ${APP_NAME}`,
    description: `Why ${APP_NAME} exists: a summary-first knowledge system for people who want to revisit, connect, and use ideas over time.`,
};

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <main className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-12">
                {/* Back link */}


                {/* Hero */}
                <div className="mb-14 space-y-6">
                    <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-b from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent font-display tracking-tight md:tracking-[-0.02em] leading-tight">
                        About {APP_NAME}
                    </h1>
                    <div className="space-y-2 border-l border-border/70 pl-5 text-base md:text-lg text-muted-foreground/80">
                        <p>The sentence that stood out.</p>
                        <p>The idea that felt important.</p>
                        <p>The moment of inspiration.</p>
                    </div>
                    <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                        {APP_NAME} was built to help them stay with us.
                    </p>
                </div>

                {/* Mission */}
                <section className="mb-16">
                    <h2 className="text-2xl font-bold mb-5 font-display">Why I Built This</h2>
                    <div className="max-w-[46rem] space-y-5 text-base leading-8 text-foreground/75 md:text-lg md:leading-9">
                        <p className="border-l-2 border-foreground/30 pl-5 text-lg font-medium leading-8 text-foreground/95 md:text-xl md:leading-9">
                            If consumption stays passive, forgetting is only a matter of time.
                        </p>
                        <p>
                            I was consuming meaningful content constantly: a sermon in church, a podcast on the move, a book that made me think differently.
                        </p>
                        <p>
                            But over time, I realized the barrier to knowledge was no longer access. We have more access to content than ever. The real challenge is digestion.
                        </p>
                        <p>
                            Too much of what we consume stays passive. Highlights end up in one place, notes in another, bookmarks somewhere else, and memory has to do the rest.
                        </p>
                        <p>
                            That is why {APP_NAME} is summary-first, but not summary-only. Summaries provide the framework. They help us understand the core argument before the details disappear. But the real value comes after that: saving what matters, keeping the original context attached, and retrieving the right idea when it becomes useful again.
                        </p>
                        <p>
                            {APP_NAME} turns content we consume once into a knowledge library we can search, revisit, and use again.
                        </p>
                    </div>
                </section>

                <hr className="mx-auto mb-14 w-2/3 border-border/30" />

                {/* Philosophy */}
                <section className="mb-20 bg-secondary/20 border border-border/50 rounded-2xl p-8 md:p-10">
                    <div>
                        <h2 className="text-xl font-bold mb-4 font-display">The Philosophy</h2>
                        <p className="text-foreground/90 text-lg leading-relaxed">
                            The goal is not to consume more. The goal is to turn passive consumption into a growing personal library.
                        </p>
                        <p className="text-muted-foreground mt-4 leading-relaxed">
                            A library that becomes more than a record of what you consumed. A place where every highlight, key point, written note, and unlocked revelation is captured with context, so it can be searched, revisited, and used again when it matters.
                        </p>
                    </div>
                </section>

                {/* CTA */}
                <section className="text-center pb-8">
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/20"
                    >
                        Start Exploring
                    </Link>
                </section>

                <CompactPublicFooter />
            </main>
        </div>
    );
}
