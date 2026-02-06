/**
 * Privacy Policy Page
 * 
 * Privacy information for Lifebook users.
 */

import Link from "next/link";

export const metadata = {
    title: "Privacy Policy | Lifebook",
    description: "Privacy policy for Lifebook - how we handle your information.",
};

export default function PrivacyPage() {
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
                        Lifebook
                    </Link>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-6 py-16">
                <div className="mb-12">
                    <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
                    <p className="text-zinc-500">Last updated: {lastUpdated}</p>
                </div>

                <div className="prose prose-invert prose-zinc max-w-none space-y-8">
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Overview</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Lifebook (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard information when you visit our website.
                        </p>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            We believe in transparency and minimalism when it comes to data collection. We only collect what&apos;s necessary to improve your experience.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Information We Collect</h2>

                        <h3 className="text-lg font-medium mb-2 text-zinc-200">Analytics Data</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            We use <strong>Vercel Analytics</strong> to understand how visitors use our site. This service collects anonymized, aggregated data including:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 mt-2 space-y-1">
                            <li>Pages viewed</li>
                            <li>Time spent on pages</li>
                            <li>Referring websites</li>
                            <li>General geographic region (country level)</li>
                            <li>Device type and browser</li>
                        </ul>
                        <p className="text-zinc-400 mt-4 text-sm">
                            Vercel Analytics is privacy-focused and does not use cookies or collect personal identifying information. Learn more at{" "}
                            <a
                                href="https://vercel.com/docs/analytics/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-zinc-300 underline hover:text-white"
                            >
                                Vercel&apos;s Privacy Documentation
                            </a>.
                        </p>

                        <h3 className="text-lg font-medium mb-2 mt-6 text-zinc-200">What We Don&apos;t Collect</h3>
                        <ul className="list-disc list-inside text-zinc-300 space-y-1">
                            <li>Personal information (name, email, address)</li>
                            <li>Payment or financial information</li>
                            <li>Tracking cookies or advertising identifiers</li>
                            <li>Social media profiles</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">How We Use Information</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            The analytics data we collect is used solely to:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 mt-2 space-y-1">
                            <li>Understand which content is most valuable to readers</li>
                            <li>Improve site performance and user experience</li>
                            <li>Identify and fix technical issues</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Third-Party Services</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Our website is hosted on <strong>Vercel</strong> and uses <strong>Supabase</strong> for data storage. Both services have their own privacy policies:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 mt-2 space-y-1">
                            <li>
                                <a
                                    href="https://vercel.com/legal/privacy-policy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-zinc-300 underline hover:text-white"
                                >
                                    Vercel Privacy Policy
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://supabase.com/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-zinc-300 underline hover:text-white"
                                >
                                    Supabase Privacy Policy
                                </a>
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Your Rights</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Since we don&apos;t collect personal data, there&apos;s nothing to request, modify, or delete. You can browse Lifebook completely anonymously.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Changes to This Policy</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            We may update this Privacy Policy from time to time. Any changes will be reflected on this page with an updated &ldquo;Last updated&rdquo; date.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-zinc-100">Contact</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            If you have any questions about this Privacy Policy, feel free to reach out via the contact methods available on our platform.
                        </p>
                    </section>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-zinc-800 py-8 mt-16">
                <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-zinc-500">
                    <span>© {new Date().getFullYear()} Lifebook</span>
                    <div className="flex gap-6">
                        <Link href="/about" className="hover:text-zinc-300 transition-colors">About</Link>
                        <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
