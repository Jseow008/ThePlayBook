"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { NetflixSidebar } from "@/components/ui/NetflixSidebar";
import { UserNav } from "@/components/ui/UserNav";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { MobileHeader } from "@/components/ui/MobileHeader";
import { AppOnboardingGate } from "@/components/ui/AppOnboardingGate";

/**
 * Public Layout Shell
 * 
 * Conditionally renders the Netflix-style app chrome (sidebar, nav, header).
 * The landing page (/) renders standalone without any chrome.
 * All other public pages get the full app experience.
 */

export function PublicLayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLandingPage = pathname === "/";
    const isBrowsePage = pathname === "/browse";
    const isFocusPage = pathname === "/focus";
    const isReadPage = pathname.startsWith("/read");

    // Landing page: standalone layout (no sidebar, no bottom nav)
    if (isLandingPage) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen bg-background">
            <Suspense fallback={null}>
                <AppOnboardingGate />
            </Suspense>

            {/* Netflix-style Sidebar (hidden on mobile) */}
            <NetflixSidebar />

            {/* Desktop Top Right Auth (hidden on mobile) */}
            <div className="hidden lg:flex fixed top-4 right-8 z-50">
                <UserNav />
            </div>


            {/* Mobile Header */}
            {!isFocusPage && <MobileHeader compact={isBrowsePage} />}

            {/* Main Content */}
            <main
                className={
                    isFocusPage || isReadPage
                        ? "lg:pl-16"
                        : isBrowsePage
                        ? "lg:pl-16 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0"
                        : "lg:pl-16 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0"
                }
            >
                {/* Mobile padding for fixed header */}
                {!isReadPage && !isFocusPage && (
                    <div className={isBrowsePage ? "lg:hidden h-12" : "lg:hidden h-14"} />
                )}
                {children}
            </main>

            {/* Mobile Bottom Navigation */}
            {!isReadPage && <MobileBottomNav compact={isBrowsePage} />}
        </div>
    );
}
