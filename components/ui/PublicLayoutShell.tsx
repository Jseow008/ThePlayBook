"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { NetflixSidebar } from "@/components/ui/NetflixSidebar";
import { UserNav } from "@/components/ui/UserNav";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { MobileHeader } from "@/components/ui/MobileHeader";
import { AppOnboardingGate } from "@/components/ui/AppOnboardingGate";
import type { User } from "@supabase/supabase-js";

/**
 * Public Layout Shell
 * 
 * Conditionally renders the Netflix-style app chrome (sidebar, nav, header).
 * The landing page (/) renders standalone without any chrome.
 * All other public pages get the full app experience.
 */

export function PublicLayoutShell({ children, initialUser }: { children: React.ReactNode, initialUser: User | null }) {
    const pathname = usePathname();
    const isLandingPage = pathname === "/";
    const isBrowsePage = pathname === "/browse";

    // Landing page: standalone layout (no sidebar, no bottom nav)
    if (isLandingPage) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen bg-background">
            <Suspense fallback={null}>
                <AppOnboardingGate initialUser={initialUser} />
            </Suspense>

            {/* Netflix-style Sidebar (hidden on mobile) */}
            <NetflixSidebar initialUser={initialUser} />

            {/* Desktop Top Right Auth (hidden on mobile) */}
            <div className="hidden lg:flex fixed top-4 right-8 z-50">
                <UserNav initialUser={initialUser} />
            </div>


            {/* Mobile Header */}
            <MobileHeader initialUser={initialUser} compact={isBrowsePage} />

            {/* Main Content */}
            <main className={isBrowsePage ? "lg:pl-16 pb-16 lg:pb-0" : "lg:pl-16 pb-20 lg:pb-0"}>
                {/* Mobile padding for fixed header */}
                {!pathname.startsWith("/read") && (
                    <div className={isBrowsePage ? "lg:hidden h-12" : "lg:hidden h-14"} />
                )}
                {children}
            </main>

            {/* Mobile Bottom Navigation */}
            <MobileBottomNav compact={isBrowsePage} />
        </div>
    );
}
