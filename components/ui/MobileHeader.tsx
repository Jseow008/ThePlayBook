"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
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

    // Completely hide on immersive routes
    if (pathname.startsWith("/read")) {
        return null;
    }

    return (
        <header
            className={cn(
                "lg:hidden fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-b border-border flex items-center justify-between px-4 transition-transform duration-300",
                compact ? "h-12" : "h-14",
                !isVisible ? "-translate-y-full" : "translate-y-0"
            )}
        >
            <Link href="/browse">
                <Logo width={compact ? 74 : 80} height={compact ? 22 : 24} />
            </Link>
            <UserNav />
        </header>
    );
}
