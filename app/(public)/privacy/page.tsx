/**
 * Privacy Policy Page
 *
 * Now inside (public) route group — inherits sidebar, mobile nav, and layout chrome.
 * Uses semantic tokens throughout for consistency.
 */

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";

export const metadata = {
    title: `Privacy Policy | ${APP_NAME}`,
    description: `Privacy policy for ${APP_NAME} - how we handle your information.`,
};

export default function PrivacyPage() {
    const lastUpdated = "May 2026";

    return (
        <div className="min-h-screen bg-background text-foreground">
            <main className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">


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
                            We believe in transparency and minimalism when it comes to data collection. We collect only what is necessary to run the product, improve the experience, and send emails you explicitly subscribe to receive.
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

                        <h3 className="text-base font-medium mb-2 mt-8 text-foreground/90">Email Subscriptions</h3>
                        <p className="text-muted-foreground leading-relaxed mb-3">
                            If you subscribe to weekly emails, we collect your email address and basic subscription metadata, including the page where you subscribed, referrer, browser user agent, subscription status, consent version, and subscribe/unsubscribe timestamps.
                        </p>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            We use this information to send the emails you requested, manage unsubscribe requests, prevent duplicate subscriptions, and understand which launch surfaces are working.
                        </p>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            If you use the request board, we may also send transactional emails when a summary you requested or voted for is published. These request notifications are separate from weekly email subscriptions and can be turned off from Settings or from the opt-out link in the notification email.
                        </p>

                        <h3 className="text-base font-medium mb-2 mt-8 text-foreground/90">Account Information</h3>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            If you sign in, we collect account information needed to authenticate you and operate personal features, such as your email address, profile record, saved library activity, highlights, notes, settings, and reading progress.
                        </p>

                        <h3 className="text-base font-medium mb-2 mt-8 text-foreground/90">What We Don&apos;t Collect</h3>
                        <ul className="space-y-2 text-muted-foreground">
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Payment or financial information</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Postal address</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Tracking cookies or advertising identifiers</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Social media profiles</span></li>
                        </ul>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">How We Use Information</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            The information we collect is used solely to:
                        </p>
                        <ul className="space-y-2 text-muted-foreground">
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Understand which content is most valuable to readers</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Improve site performance and user experience</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Identify and fix technical issues</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Send weekly emails to people who explicitly subscribe</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Send transactional request-board notifications for summaries users requested or voted for</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Process unsubscribe requests and maintain subscription status</span></li>
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
                            You can request access, correction, or deletion of personal information associated with your account or email subscription. You can unsubscribe from weekly emails using the unsubscribe link included in those emails once email sending is active, and you can turn off request-board notification emails from Settings or from the opt-out link included in those notifications.
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
