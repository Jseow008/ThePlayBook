/**
 * About Page
 * 
 * Information about Flux and its mission.
 */

import Link from "next/link";
import { BookOpen, Headphones, Lightbulb, Sparkles } from "lucide-react";

export const metadata = {
    title: "About | NETFLUX",
    description: "Learn more about NETFLUX - your curated knowledge stream for books, podcasts, and ideas.",
};

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            {/* Header */}
            <header className="border-b border-zinc-800">
                <div className="max-w-4xl mx-auto px-6 py-6">
                    <Link
                        href="/"
                        className="text-2xl font-bold tracking-tight hover:text-zinc-300 transition-colors"
                    >
                        NETFLUX
                    </Link>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-6 py-16">
                {/* Hero */}
                <div className="text-center mb-16">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                        About NETFLUX
                    </h1>
                    <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                        A personal knowledge stream built to capture, distill, and revisit the best ideas from books, podcasts, and articles.
                    </p>
                </div>

                {/* Mission */}
                <section className="mb-16">
                    <h2 className="text-2xl font-semibold mb-4 text-zinc-100">The Mission</h2>
                    <div className="prose prose-invert prose-zinc max-w-none">
                        <p className="text-zinc-300 leading-relaxed text-lg">
                            We consume so much content—podcasts during commutes, books before bed, articles throughout the day—but how much do we actually retain? NETFLUX exists to solve that problem.
                        </p>
                        <p className="text-zinc-300 leading-relaxed text-lg mt-4">
                            Every entry here is a personal reflection: a distillation of key insights, memorable quotes, and actionable takeaways. It&apos;s not just a summary—it&apos;s a second brain for ideas worth remembering.
                        </p>
                    </div>
                </section>

                {/* Features */}
                <section className="mb-16">
                    <h2 className="text-2xl font-semibold mb-8 text-zinc-100">What You&apos;ll Find</h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors">
                            <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center mb-4">
                                <BookOpen className="w-6 h-6 text-zinc-400" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">Book Summaries</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                Core ideas from transformative books, distilled into digestible insights you can revisit anytime.
                            </p>
                        </div>
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors">
                            <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center mb-4">
                                <Headphones className="w-6 h-6 text-zinc-400" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">Podcast Notes</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                Key moments and insights from conversations with some of the world&apos;s most interesting minds.
                            </p>
                        </div>
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors">
                            <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center mb-4">
                                <Lightbulb className="w-6 h-6 text-zinc-400" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">Personal Reflections</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                Not just summaries—personal takes on how these ideas connect and apply to real life.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Philosophy */}
                <section className="mb-16 bg-zinc-900/30 border border-zinc-800 rounded-2xl p-8">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                            <Sparkles className="w-5 h-5 text-zinc-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold mb-3 text-zinc-100">The Philosophy</h2>
                            <blockquote className="text-zinc-300 text-lg italic leading-relaxed">
                                &ldquo;The faintest ink is more powerful than the strongest memory.&rdquo;
                            </blockquote>
                            <p className="text-zinc-400 mt-4 leading-relaxed">
                                Ideas are only valuable if we can access them when we need them. NETFLUX is a living document—a place to capture wisdom before it fades.
                            </p>
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="text-center">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-100 text-zinc-900 font-medium rounded-lg hover:bg-white transition-colors"
                    >
                        Start Exploring
                    </Link>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-zinc-800 py-8 mt-16">
                <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-zinc-500">
                    <span>© {new Date().getFullYear()} NETFLUX</span>
                    <div className="flex gap-6">
                        <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
                        <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
