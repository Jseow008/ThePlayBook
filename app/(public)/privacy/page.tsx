/**
 * Privacy Policy Page
 *
 * Now inside (public) route group — inherits sidebar, mobile nav, and layout chrome.
 * Uses semantic tokens throughout for consistency.
 */

import { APP_NAME } from "@/lib/brand";
import { CompactPublicFooter } from "@/components/ui/CompactPublicFooter";

export const metadata = {
    title: `Privacy Policy | ${APP_NAME}`,
    description: `Privacy policy for ${APP_NAME} - how we handle your information.`,
};

export default function PrivacyPage() {
    const lastUpdated = "July 2026";

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
                                {APP_NAME} (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard information when you visit our website, create an account, subscribe to emails, or use {APP_NAME} features.
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
                            We use <strong className="text-foreground">Vercel Analytics</strong> and product analytics to understand how visitors and users interact with {APP_NAME}. Analytics data may include:
                        </p>
                        <ul className="space-y-2 text-muted-foreground mb-4">
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Pages viewed</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Time spent on pages</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Referring websites</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>General geographic region (country level)</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Device type and browser</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Product events, such as saving to library, creating a highlight, asking a question, or performing a search</span></li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            Product analytics events are designed to avoid sending raw search queries, highlighted text, note bodies, or other sensitive user-generated content.
                        </p>
                        <p className="text-sm text-muted-foreground/70">
                            Vercel Analytics is privacy-focused and does not use third-party cookies or collect personal identifiers for cross-site tracking. Learn more at{" "}
                            <a
                                href="https://vercel.com/docs/analytics/privacy-policy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground/70 underline hover:text-foreground transition-colors"
                            >
                                Vercel&apos;s Privacy Documentation
                            </a>.
                        </p>

                        <h3 className="text-base font-medium mb-2 mt-8 text-foreground/90">Email Subscriptions</h3>
                        <p className="text-muted-foreground leading-relaxed mb-3">
                            If you subscribe to weekly emails or other emails you explicitly request, we collect your email address and basic subscription metadata, including the page where you subscribed, referrer, browser user agent, subscription status, consent version, and subscribe/unsubscribe timestamps.
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

                        <h3 className="text-base font-medium mb-2 mt-8 text-foreground/90">Search and AI Features</h3>
                        <p className="text-muted-foreground leading-relaxed mb-3">
                            If you use search, Ask My Library, Ask These Notes, or similar AI-assisted features, we may process your query, chat history, saved library content, highlights, notes, reading progress, and related context to generate relevant results or answers.
                        </p>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            We use this information to provide the feature, maintain quality, enforce usage limits, protect against abuse, and improve {APP_NAME}. AI features may send the minimum relevant context needed to our AI service providers to generate a response.
                        </p>

                        <h3 className="text-base font-medium mb-2 mt-8 text-foreground/90">What We Don&apos;t Currently Collect</h3>
                        <ul className="space-y-2 text-muted-foreground">
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Payment or financial information</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Postal address</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Advertising identifiers</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Social media profiles, unless you later choose to sign in through a provider that shares profile metadata</span></li>
                        </ul>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">How We Use Information</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            The information we collect is used to:
                        </p>
                        <ul className="space-y-2 text-muted-foreground">
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Understand which content is most valuable to readers</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Improve site performance and user experience</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Identify and fix technical issues</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Send weekly emails to people who explicitly subscribe</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Send transactional request-board notifications for summaries users requested or voted for</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Process unsubscribe requests and maintain subscription status</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Operate account, library, notes, highlights, search, and AI-assisted features</span></li>
                            <li className="flex gap-3"><span className="text-primary mt-1.5 shrink-0">•</span><span>Enforce usage limits, prevent abuse, and keep the service secure</span></li>
                        </ul>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Third-Party Services</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            {APP_NAME} is hosted on <strong className="text-foreground">Vercel</strong>, uses <strong className="text-foreground">Supabase</strong> for data storage and authentication, uses <strong className="text-foreground">PostHog</strong> for product analytics when configured, and may use AI service providers, such as Anthropic, OpenAI, or Google, depending on the feature and configuration. These providers have their own privacy policies:
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
                            <li className="flex gap-3">
                                <span className="text-primary mt-1.5 shrink-0">•</span>
                                <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">PostHog Privacy Policy</a>
                            </li>
                            <li className="flex gap-3">
                                <span className="text-primary mt-1.5 shrink-0">•</span>
                                <span>AI service providers, such as Anthropic, OpenAI, or Google, depending on the feature and configuration</span>
                            </li>
                        </ul>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Cookies and Browser Storage</h2>
                        <div className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                {APP_NAME} may use essential cookies, local storage, or similar browser storage technologies to keep you signed in, remember product preferences, support security, and make core features work.
                            </p>
                            <p>
                                We do not use these technologies for third-party advertising. Vercel Web Analytics does not use cookies for analytics.
                            </p>
                        </div>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">International Transfers</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            {APP_NAME} may use service providers that process or store information in countries outside your country of residence. Where required, we take steps intended to ensure that personal information remains protected according to applicable data protection laws.
                        </p>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Data Retention</h2>
                        <div className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                We retain account and library data for as long as your account remains active, unless you request deletion or we no longer need the data to provide the service, comply with legal obligations, resolve disputes, or maintain security.
                            </p>
                            <p>
                                Email subscription records are retained while you remain subscribed and for a reasonable period after unsubscribe to maintain suppression records and prevent further emails. Analytics data is retained according to the retention practices of the analytics services we use.
                            </p>
                        </div>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Your Rights</h2>
                        <div className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                You can request access, correction, or deletion of personal information associated with your account or email subscription. You can request deletion of your account and associated personal information from your Settings page, where available, or by contacting us at javierseowww@gmail.com.
                            </p>
                        </div>
                    </section>

                    <hr className="border-border/40" />

                    <section>
                        <h2 className="text-xl font-semibold mb-4 font-display">Security</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We use reasonable technical and organisational measures to protect personal information against unauthorised access, loss, misuse, or alteration. However, no internet-based service can be guaranteed to be completely secure.
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
                            For privacy-related questions, data protection inquiries, access requests, correction requests, deletion requests, or consent withdrawal requests, contact our privacy and data protection contact at{" "}
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
