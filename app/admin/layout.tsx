/**
 * Admin Layout
 * 
 * Protected layout for admin pages.
 * Uses a light theme to differentiate from the public site.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyAdminSession } from "@/lib/admin/auth";
import { BookOpen } from "lucide-react";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import { AdminPrimaryNav } from "@/components/admin/AdminPrimaryNav";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const isAuthenticated = await verifyAdminSession({ route: "/admin" });

    if (!isAuthenticated) {
        redirect("/admin-login");
    }

    return (
        <div className="min-h-screen bg-background text-foreground light">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col gap-3 py-3 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:py-0">
                        {/* Logo */}
                        <Link href="/admin" className="flex items-center gap-2 group">
                            <div className="w-8 h-8 bg-zinc-900 text-white rounded-lg flex items-center justify-center transition-transform group-hover:scale-110">
                                <BookOpen className="w-4 h-4" />
                            </div>
                            <span className="font-semibold text-zinc-900 tracking-tight">{APP_NAME} Admin</span>
                        </Link>

                        {/* Navigation */}
                        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap lg:justify-end">
                            <AdminPrimaryNav />
                            <div className="hidden h-6 w-px bg-zinc-200 mx-2 lg:block" />
                            <Link
                                href="/browse"
                                target="_blank"
                                className="focus-ring ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 lg:ml-0"
                            >
                                <span className="sm:hidden">Site</span>
                                <span className="hidden sm:inline">View Site</span>
                            </Link>
                            <AdminLogoutButton />
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
        </div>
    );
}
