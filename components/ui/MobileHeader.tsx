"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import { UserNav } from "@/components/ui/UserNav";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

export function MobileHeader({
    compact = false,
}: {
    compact?: boolean;
}) {
    const pathname = usePathname();
    const [isVisible, setIsVisible] = useState(true);
    const lastScrollYRef = useRef(0);
    const frameRef = useRef<number | null>(null);

    useEffect(() => {
        const handleScroll = () => {
            if (frameRef.current !== null) return;

            frameRef.current = window.requestAnimationFrame(() => {
                const currentScrollY = window.scrollY;
                const lastScrollY = lastScrollYRef.current;

                if (Math.abs(currentScrollY - lastScrollY) >= 10) {
                    setIsVisible(!(currentScrollY > lastScrollY && currentScrollY > 50));
                    lastScrollYRef.current = currentScrollY;
                }

                frameRef.current = null;
            });
        };

        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
            }
        };
    }, []);

    useEffect(() => {
        setIsVisible(true);
        lastScrollYRef.current = window.scrollY;
        if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
    }, [pathname]);

    return (
        <header
            data-testid="mobile-header"
            style={{ transform: isVisible ? "translateY(0)" : "translateY(-100%)" }}
            className={cn(
                "mobile-header-motion lg:hidden fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-b border-border flex items-center justify-between px-4 transition-transform duration-300 motion-reduce:transition-none",
                compact ? "mobile-header-compact-height" : "mobile-header-height"
            )}
        >
            <Link href="/browse">
                <Logo width={compact ? 74 : 80} height={compact ? 22 : 24} priority />
            </Link>
            <div className="flex items-center gap-3">
                <Link
                    href="/ask"
                    aria-label="Ask AI"
                    title="Ask AI"
                    className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <ChatCircleDotsIcon className="size-4" weight="duotone" aria-hidden="true" />
                    <span>Ask AI</span>
                </Link>
                <UserNav />
            </div>
        </header>
    );
}
