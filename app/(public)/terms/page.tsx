/**
 * Terms of Service Page
 *
 * Now inside (public) route group — inherits sidebar, mobile nav, and layout chrome.
 * Uses semantic tokens throughout for consistency.
 */

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
    title: `Terms of Service | ${APP_NAME}`,
    description: `Terms of service for using ${APP_NAME}.`,
};

export default function TermsPage() {
    const lastUpdated = "February 2026";

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

                {/* Header */}
                <div className="mb-14">
                    <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight leading-tight mb-3">Terms of Service</h1>
                    <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
                </div>

                {/* Content */}
                <div className="space-y-12">
                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display tracking-tight">Welcome to {APP_NAME}</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            By accessing and using {APP_NAME} (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Nature of Content</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            {APP_NAME} is a personal knowledge stream containing summaries, reflections, and insights derived from books, podcasts, articles, and other media. Please note:
                        </p>
                        <ul className="space-y-3 text-muted-foreground">
                            <li className="flex gap-3">
                                <span className="text-primary mt-1.5 shrink-0">•</span>
                                <span><strong className="text-foreground">Personal Interpretations:</strong> All content represents personal reflections and interpretations of source materials. They are not official summaries endorsed by the original authors or creators.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="text-primary mt-1.5 shrink-0">•</span>
                                <span><strong className="text-foreground">Educational Purpose:</strong> Content is provided for educational and personal development purposes only.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="text-primary mt-1.5 shrink-0">•</span>
                                <span><strong className="text-foreground">Not a Substitute:</strong> Our summaries are meant to complement, not replace, the original works. We encourage you to read, watch, or listen to the full source materials.</span>
                            </li>
                        </ul>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Intellectual Property</h2>

                        <h3 className="text-base font-medium mb-2 text-foreground/90">Original Works</h3>
                        <p className="text-muted-foreground leading-relaxed mb-6">
                            The books, podcasts, and other media summarized on {APP_NAME} are the intellectual property of their respective authors, publishers, and creators. All rights to original works remain with their owners.
                        </p>

                        <h3 className="text-base font-medium mb-2 text-foreground/90">Our Content</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            The summaries, commentary, and presentation on {APP_NAME} are original works created through personal reflection and analysis. This content is protected under applicable copyright laws.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Acceptable Use</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            You may use {APP_NAME} for personal, non-commercial purposes. You agree not to:
                        </p>
                        <ul className="space-y-2.5 text-muted-foreground">
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Reproduce, distribute, or republish content without permission</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Use content for commercial purposes</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Scrape, crawl, or use automated tools to extract content</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Misrepresent summaries as official or endorsed by original authors</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Use the Service in any way that violates applicable laws</span></li>
                        </ul>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Disclaimer</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            The Service is provided &ldquo;as is&rdquo; without warranties of any kind, either express or implied. We do not guarantee:
                        </p>
                        <ul className="space-y-2.5 text-muted-foreground">
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>The accuracy, completeness, or reliability of any content</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>That the Service will be uninterrupted or error-free</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>That the content is suitable for any particular purpose</span></li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            Use your own judgment when applying ideas from this or any other source.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Limitation of Liability</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            To the fullest extent permitted by law, {APP_NAME} and its creator shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of the Service.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Changes to Terms</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We reserve the right to modify these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms. We encourage you to review this page periodically.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Fair Use</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Our summaries and commentary are created in good faith under principles of fair use for educational and transformative purposes. If you are a copyright holder and have concerns about any content, please contact us and we will address it promptly.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Contact</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            For questions about these Terms, please reach out via the contact methods available on our platform.
                        </p>
                    </section>
                </div>

                {/* Footer nav */}
                <div className="mt-16 pt-8 border-t border-border/40 flex items-center justify-between text-sm text-muted-foreground">
                    <span>&copy; {new Date().getFullYear()} {APP_NAME}</span>
                    <div className="flex gap-6">
                        <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
                        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
