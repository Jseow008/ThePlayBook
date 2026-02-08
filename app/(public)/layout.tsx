import { createClient } from "@/lib/supabase/server";
import { NetflixSidebar } from "@/components/ui/NetflixSidebar";
import { UserNav } from "@/components/ui/UserNav";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";

/**
 * Public Layout
 * 
 * Netflix-style layout with expandable sidebar and content area.
 * Used for landing page, preview pages, and collections.
 */

export default async function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    return (
        <div className="min-h-screen bg-background">
            {/* Netflix-style Sidebar (hidden on mobile) */}
            <NetflixSidebar />

            {/* Desktop Top Right Auth (hidden on mobile) */}
            <div className="hidden lg:flex fixed top-4 right-8 z-50">
                <UserNav />
            </div>

            {/* Desktop Top Gradient (for better text ease) */}
            <div className="hidden lg:block fixed top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 to-transparent z-40 pointer-events-none" />

            {/* Mobile Header */}
            <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-black/90 backdrop-blur-md border-b border-zinc-800/50 flex items-center justify-between px-4">
                <span className="font-bold text-lg text-foreground">Flux</span>
                <UserNav />
            </header>

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
