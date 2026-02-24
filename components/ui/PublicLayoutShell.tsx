"use client";

import { usePathname } from "next/navigation";
import { NetflixSidebar } from "@/components/ui/NetflixSidebar";
import { UserNav } from "@/components/ui/UserNav";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { MobileHeader } from "@/components/ui/MobileHeader";
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

    // Landing page: standalone layout (no sidebar, no bottom nav)
    if (isLandingPage) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Netflix-style Sidebar (hidden on mobile) */}
            <NetflixSidebar initialUser={initialUser} />

            {/* Desktop Top Right Auth (hidden on mobile) */}
            <div className="hidden lg:flex fixed top-4 right-8 z-50">
                <UserNav initialUser={initialUser} />
            </div>


            {/* Mobile Header */}
            <MobileHeader initialUser={initialUser} />

            {/* Main Content */}
            <main className="lg:pl-16 pb-20 lg:pb-0">
                {/* Mobile padding for fixed header */}
                <div className="lg:hidden h-14" />
                {children}
            </main>

            {/* Mobile Bottom Navigation */}
            <MobileBottomNav />
        </div>
    );
}
