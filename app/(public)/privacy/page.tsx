/**
 * Privacy Policy Page
 *
 * Now inside (public) route group — inherits sidebar, mobile nav, and layout chrome.
 * Uses semantic tokens throughout for consistency.
 */

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
    title: `Privacy Policy | ${APP_NAME}`,
    description: `Privacy policy for ${APP_NAME} - how we handle your information.`,
};

export default function PrivacyPage() {
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
                    <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight leading-tight mb-3">Privacy Policy</h1>
                    <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
                </div>

                {/* Content */}
                <div className="space-y-12">
                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display tracking-tight">Overview</h2>
                        <div className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                {APP_NAME} (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard information when you visit our website.
                            </p>
                            <p>
                                We believe in transparency and minimalism when it comes to data collection. We only collect what&apos;s necessary to improve your experience.
                            </p>
                        </div>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Information We Collect</h2>

                        <h3 className="text-base font-medium mb-2 text-foreground/90">Analytics Data</h3>
                        <p className="text-muted-foreground leading-relaxed mb-3">
                            We use <strong className="text-foreground">Vercel Analytics</strong> to understand how visitors use our site. This service collects anonymized, aggregated data including:
                        </p>
                        <ul className="space-y-2 text-muted-foreground mb-4">
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Pages viewed</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Time spent on pages</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Referring websites</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>General geographic region (country level)</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Device type and browser</span></li>
                        </ul>
                        <p className="text-sm text-muted-foreground/70">
                            Vercel Analytics is privacy-focused and does not use cookies or collect personal identifying information. Learn more at{" "}
                            <a
                                href="https://vercel.com/docs/analytics/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground/70 underline hover:text-foreground transition-colors"
                            >
                                Vercel&apos;s Privacy Documentation
                            </a>.
                        </p>

                        <h3 className="text-base font-medium mb-2 mt-8 text-foreground/90">What We Don&apos;t Collect</h3>
                        <ul className="space-y-2 text-muted-foreground">
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Personal information (name, email, address)</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Payment or financial information</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Tracking cookies or advertising identifiers</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Social media profiles</span></li>
                        </ul>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">How We Use Information</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            The analytics data we collect is used solely to:
                        </p>
                        <ul className="space-y-2 text-muted-foreground">
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Understand which content is most valuable to readers</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Improve site performance and user experience</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Identify and fix technical issues</span></li>
                        </ul>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Third-Party Services</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            Our website is hosted on <strong className="text-foreground">Vercel</strong> and uses <strong className="text-foreground">Supabase</strong> for data storage. Both services have their own privacy policies:
                        </p>
                        <ul className="space-y-2 text-muted-foreground">
                            <li className="flex gap-3">
                                <span className="text-primary mt-1.5 shrink-0">•</span>
                                <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">Vercel Privacy Policy</a>
                            </li>
                            <li className="flex gap-3">
                                <span className="text-primary mt-1.5 shrink-0">•</span>
                                <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">Supabase Privacy Policy</a>
                            </li>
                        </ul>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Your Rights</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Since we don&apos;t collect personal data, there&apos;s nothing to request, modify, or delete. You can browse {APP_NAME} completely anonymously.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Changes to This Policy</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We may update this Privacy Policy from time to time. Any changes will be reflected on this page with an updated &ldquo;Last updated&rdquo; date.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Contact</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            If you have any questions about this Privacy Policy, feel free to reach out via the contact methods available on our platform.
                        </p>
                    </section>
                </div>

                {/* Footer nav */}
                <div className="mt-16 pt-8 border-t border-border/40 flex items-center justify-between text-sm text-muted-foreground">
                    <span>&copy; {new Date().getFullYear()} {APP_NAME}</span>
                    <div className="flex gap-6">
                        <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
                        <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
