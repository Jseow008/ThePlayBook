"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { NetfluxSidebar } from "@/components/ui/NetfluxSidebar";
import { UserNav } from "@/components/ui/UserNav";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { MobileHeader } from "@/components/ui/MobileHeader";
import { AppOnboardingGate } from "@/components/ui/AppOnboardingGate";
import { getRouteChromePolicy } from "@/lib/route-chrome-policy";
import { cn } from "@/lib/utils";

/**
 * Public Layout Shell
 * 
 * Conditionally renders the app chrome (sidebar, nav, header).
 * The landing page (/) renders standalone without any chrome.
 * All other public pages get the full app experience.
 */

export function PublicLayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const policy = getRouteChromePolicy(pathname);
    const showMobileHeader = policy.mobileHeader !== "none";
    const showMobileBottomNav = policy.mobileBottomNav !== "none";

    // Landing page: standalone layout (no sidebar, no bottom nav)
    if (policy.viewportMode === "standalone") {
        return <>{children}</>;
    }

    return (
        <div
            className={cn(
                "bg-background",
                policy.viewportMode === "immersive"
                    ? "h-[100dvh] overflow-hidden"
                    : "min-h-dvh"
            )}
        >
            <Suspense fallback={null}>
                <AppOnboardingGate />
            </Suspense>

            {/* Desktop sidebar (hidden on mobile) */}
            <Suspense fallback={null}>
                <NetfluxSidebar />
            </Suspense>

            {/* Desktop Top Right Auth (hidden on mobile) */}
            <div className="hidden lg:flex fixed top-4 right-8 z-50">
                <Suspense fallback={null}>
                    <UserNav />
                </Suspense>
            </div>


            {/* Mobile Header */}
            {showMobileHeader && (
                <Suspense fallback={null}>
                    <MobileHeader compact={policy.mobileHeader === "compact"} />
                </Suspense>
            )}

            {/* Main Content */}
            <main
                className={cn(
                    policy.desktopSidebarPadding && "lg:pl-16",
                    policy.viewportMode === "immersive" && "h-full overflow-hidden",
                    policy.mobileBottomPadding === "default" && "mobile-shell-bottom-padding lg:pb-0",
                    policy.mobileBottomPadding === "compact" && "mobile-shell-bottom-padding-compact lg:pb-0"
                )}
            >
                {/* Mobile padding for fixed header */}
                {showMobileHeader && (
                    <div
                        className={cn(
                            "lg:hidden",
                            policy.mobileHeader === "compact"
                                ? "mobile-header-compact-height"
                                : "mobile-header-height"
                        )}
                    />
                )}
                {children}
            </main>

            {/* Mobile Bottom Navigation */}
            {showMobileBottomNav && <MobileBottomNav compact={policy.mobileBottomNav === "compact"} />}
        </div>
    );
}
