import Link from "next/link";

import { APP_NAME } from "@/lib/brand";

const FOOTER_LINKS = [
    { href: "/browse", label: "Browse" },
    { href: "/about", label: "About" },
    { href: "mailto:javierseowww@gmail.com", label: "Contact" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
];

export function CompactPublicFooter() {
    return (
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-8 text-sm text-muted-foreground sm:flex-row">
            <span>&copy; {new Date().getFullYear()} {APP_NAME}</span>
            <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                {FOOTER_LINKS.map((link) => (
                    <Link key={link.href} href={link.href} className="hover:text-foreground transition-colors">
                        {link.label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
