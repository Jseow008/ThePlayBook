/**
 * About Page
 *
 * Information about ${APP_NAME} and its mission.
 * Lives inside the (public) layout for consistent sidebar/nav chrome.
 */

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { BookOpen, Headphones, Lightbulb, ArrowLeft } from "lucide-react";

export const metadata = {
    title: `About | ${APP_NAME}`,
    description: `Learn more about ${APP_NAME} - your curated knowledge stream for books, podcasts, and ideas.`,
};

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <main className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
                {/* Back link */}
                {/* Back to Library */}
                <div className="mb-8">
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground transition-all group"
                    >
                        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
                        <span>Back to Library</span>
                    </Link>
                </div>

                {/* Hero */}
                <div className="text-center mb-20 space-y-6">
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-b from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent font-display tracking-tight md:tracking-[-0.02em] leading-tight">
                        About {APP_NAME}
                    </h1>
                    <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        A personal knowledge stream built to capture, distill, and revisit the best ideas from books, podcasts, and articles.
                    </p>
                </div>

                {/* Mission */}
                <section className="mb-16">
                    <h2 className="text-2xl font-bold mb-5 font-display">The Mission</h2>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            We consume so much content—podcasts during commutes, books before bed, articles throughout the day—but how much do we actually retain? {APP_NAME} exists to solve that problem.
                        </p>
                        <p>
                            Every entry here is a personal reflection: a distillation of key insights, memorable quotes, and actionable takeaways. It&apos;s not just a summary—it&apos;s a collection of notes for ideas worth remembering.
                        </p>
                    </div>
                </section>

                <hr className="border-border/50 mb-16" />

                {/* Features */}
                <section className="mb-16">
                    <h2 className="text-2xl font-bold mb-8 font-display">What You&apos;ll Find</h2>
                    <div className="grid md:grid-cols-3 gap-5">
                        {[
                            {
                                icon: BookOpen,
                                title: "Book Summaries",
                                text: "Core ideas from transformative books, distilled into digestible insights you can revisit anytime.",
                            },
                            {
                                icon: Headphones,
                                title: "Podcast Notes",
                                text: "Key moments and insights from conversations with some of the world\u2019s most interesting minds.",
                            },
                            {
                                icon: Lightbulb,
                                title: "Personal Reflections",
                                text: "Not just summaries\u2014personal takes on how these ideas connect and apply to real life.",
                            },
                        ].map((card) => (
                            <div
                                key={card.title}
                                className="bg-card/50 border border-border/50 rounded-xl p-6 hover:border-border/80 transition-colors"
                            >
                                <div className="w-11 h-11 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                                    <card.icon className="w-5 h-5 text-primary" />
                                </div>
                                <h3 className="text-base font-semibold mb-2 font-display">{card.title}</h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">{card.text}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <hr className="border-border/50 mb-16" />

                {/* Philosophy */}
                {/* Philosophy */}
                <section className="mb-20 bg-secondary/20 border border-border/50 rounded-2xl p-8 md:p-10">
                    <div>
                        <h2 className="text-xl font-bold mb-4 font-display">The Philosophy</h2>
                        <blockquote className="text-foreground/90 text-lg italic leading-relaxed">
                            &ldquo;The faintest ink is more powerful than the strongest memory.&rdquo;
                        </blockquote>
                        <p className="text-muted-foreground mt-4 leading-relaxed">
                            Ideas are only valuable if we can access them when we need them. {APP_NAME} is a living document—a place to capture wisdom before it fades.
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

                {/* Footer nav */}
                <div className="mt-16 pt-8 border-t border-border/40 flex items-center justify-between text-sm text-muted-foreground">
                    <span>&copy; {new Date().getFullYear()} {APP_NAME}</span>
                    <div className="flex gap-6">
                        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                        <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
