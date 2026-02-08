/**
 * Terms of Service Page
 * 
 * Terms and conditions for using Flux.
 */

import Link from "next/link";

export const metadata = {
    title: "Terms of Service | Flux",
    description: "Terms of service for using Flux.",
};

export default function TermsPage() {
    const lastUpdated = "February 2026";

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            {/* Header */}
            <header className="border-b border-zinc-800">
                <div className="max-w-4xl mx-auto px-6 py-6">
                    <Link
                        href="/"
                        className="text-2xl font-bold tracking-tight hover:text-zinc-300 transition-colors"
                    >
                        Flux
                    </Link>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-6 py-16">
                <div className="mb-12">
                    <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
                    <p className="text-zinc-500">Last updated: {lastUpdated}</p>
                </div>

                <div className="prose prose-invert prose-zinc max-w-none space-y-8">
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Welcome to Flux</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            By accessing and using Flux (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Nature of Content</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Flux is a personal knowledge stream containing summaries, reflections, and insights derived from books, podcasts, articles, and other media. Please note:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 mt-4 space-y-2">
                            <li>
                                <strong>Personal Interpretations:</strong> All content represents personal reflections and interpretations of source materials. They are not official summaries endorsed by the original authors or creators.
                            </li>
                            <li>
                                <strong>Educational Purpose:</strong> Content is provided for educational and personal development purposes only.
                            </li>
                            <li>
                                <strong>Not a Substitute:</strong> Our summaries are meant to complement, not replace, the original works. We encourage you to read, watch, or listen to the full source materials.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Intellectual Property</h2>

                        <h3 className="text-lg font-medium mb-2 text-zinc-200">Original Works</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            The books, podcasts, and other media summarized on Flux are the intellectual property of their respective authors, publishers, and creators. All rights to original works remain with their owners.
                        </p>

                        <h3 className="text-lg font-medium mb-2 mt-4 text-zinc-200">Our Content</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            The summaries, commentary, and presentation on Flux are original works created through personal reflection and analysis. This content is protected under applicable copyright laws.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Acceptable Use</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            You may use Flux for personal, non-commercial purposes. You agree not to:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 mt-4 space-y-2">
                            <li>Reproduce, distribute, or republish content without permission</li>
                            <li>Use content for commercial purposes</li>
                            <li>Scrape, crawl, or use automated tools to extract content</li>
                            <li>Misrepresent summaries as official or endorsed by original authors</li>
                            <li>Use the Service in any way that violates applicable laws</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Disclaimer</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            The Service is provided &ldquo;as is&rdquo; without warranties of any kind, either express or implied. We do not guarantee:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 mt-4 space-y-2">
                            <li>The accuracy, completeness, or reliability of any content</li>
                            <li>That the Service will be uninterrupted or error-free</li>
                            <li>That the content is suitable for any particular purpose</li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            Use your own judgment when applying ideas from this or any other source.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Limitation of Liability</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            To the fullest extent permitted by law, Flux and its creator shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Changes to Terms</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            We reserve the right to modify these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms. We encourage you to review this page periodically.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Fair Use</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Our summaries and commentary are created in good faith under principles of fair use for educational and transformative purposes. If you are a copyright holder and have concerns about any content, please contact us and we will address it promptly.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Contact</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            For questions about these Terms, please reach out via the contact methods available on our platform.
                        </p>
                    </section>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-zinc-800 py-8 mt-16">
                <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-zinc-500">
                    <span>© {new Date().getFullYear()} Flux</span>
                    <div className="flex gap-6">
                        <Link href="/about" className="hover:text-zinc-300 transition-colors">About</Link>
                        <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
