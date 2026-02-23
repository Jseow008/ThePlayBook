"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserNav } from "@/components/ui/UserNav";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

export function MobileHeader() {
    const pathname = usePathname();
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);



    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;

            // Only trigger hide/show if scrolling more than 10px to avoid jitter
            if (Math.abs(currentScrollY - lastScrollY) < 10) return;

            if (currentScrollY > lastScrollY && currentScrollY > 50) {
                // Scrolling down past 50px
                setIsVisible(false);
            } else {
                // Scrolling up
                setIsVisible(true);
            }

            setLastScrollY(currentScrollY);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleScroll);
        };
    }, [lastScrollY]);

    // Completely hide on immersive routes
    if (pathname.startsWith("/read")) {
        return null;
    }

    return (
        <header
            className={cn(
                "lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-background/95 backdrop-blur-md border-b border-border flex items-center justify-between px-4 transition-transform duration-300",
                !isVisible ? "-translate-y-full" : "translate-y-0"
            )}
        >
            <Link href="/browse">
                <Logo width={80} height={24} />
            </Link>
            <UserNav />
        </header>
    );
}
