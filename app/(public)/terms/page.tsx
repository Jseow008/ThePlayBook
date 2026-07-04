/**
 * Terms of Service Page
 *
 * Now inside (public) route group — inherits sidebar, mobile nav, and layout chrome.
 * Uses semantic tokens throughout for consistency.
 */

import { APP_NAME } from "@/lib/brand";
import { CompactPublicFooter } from "@/components/ui/CompactPublicFooter";

export const metadata = {
    title: `Terms of Service | ${APP_NAME}`,
    description: `Terms of service for using ${APP_NAME}.`,
};

export default function TermsPage() {
    const lastUpdated = "July 2026";

    return (
        <div className="min-h-screen bg-background text-foreground">
            <main className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">


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
                        <h2 className="text-xl font-semibold mb-4 font-display">Eligibility and Accounts</h2>
                        <div className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                You may use {APP_NAME} only if you are legally able to agree to these Terms and use the Service under the laws that apply to you.
                            </p>
                            <p>
                                If you create an account, you are responsible for keeping your sign-in information secure and for activity that occurs through your account. You agree to provide accurate account information and to notify us if you believe your account has been accessed without permission.
                            </p>
                            <p>
                                You may request account deletion from your Settings page, where available, or by contacting us. We may suspend or terminate access to the Service if an account is used in a way that violates these Terms, creates risk for other users, or may harm the Service.
                            </p>
                        </div>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Nature of Content</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            {APP_NAME} is a summary-first knowledge system containing structured summaries, commentary, and insights derived from books, podcasts, articles, and other media. Please note:
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

                        <h3 className="text-base font-medium mb-2 mt-8 text-foreground/90">Your Content</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            You retain ownership of notes, highlights, requests, prompts, and other content you submit or save through the Service. You grant {APP_NAME} permission to host, store, process, display, and use that content as needed to operate, secure, improve, and provide the Service and its features to you.
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
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Submit unlawful, infringing, abusive, deceptive, or harmful content</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Attempt to bypass rate limits, access controls, security measures, or usage restrictions</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Use the Service in any way that violates applicable laws</span></li>
                        </ul>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">AI-Assisted Features</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            {APP_NAME} may provide search, retrieval, recommendation, and ask features powered by AI systems. AI-generated responses may be incomplete, inaccurate, or based on limited context. You are responsible for evaluating responses before relying on them, and they should not be treated as professional, legal, financial, medical, or other specialist advice.
                        </p>
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
                        <h2 className="text-xl font-semibold mb-4 font-display">Service Changes and Availability</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We may add, modify, suspend, or discontinue features or parts of the Service at any time. We do not guarantee that the Service or any specific feature will always be available, uninterrupted, or unchanged.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Privacy</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Our collection and use of personal information is described in our{" "}
                            <a href="/privacy" className="text-foreground/80 underline hover:text-foreground transition-colors">
                                Privacy Policy
                            </a>.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Fair Use</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We aim for summaries and commentary on {APP_NAME} to be educational, analytical, and transformative, and to complement rather than replace original works. If you are a copyright holder and have concerns about any content, please contact us and we will review the concern in good faith.
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
                        <h2 className="text-xl font-semibold mb-4 font-display">Contact</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            For questions about these Terms, contact us at{" "}
                            <a href="mailto:javierseowww@gmail.com" className="text-foreground/80 underline hover:text-foreground transition-colors">
                                javierseowww@gmail.com
                            </a>.
                        </p>
                    </section>
                </div>

                <CompactPublicFooter />
            </main>
        </div>
    );
}
