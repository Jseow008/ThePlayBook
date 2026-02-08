/**
 * Admin Layout
 * 
 * Protected layout for admin pages.
 * Uses a light theme to differentiate from the public site.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyAdminSession } from "@/lib/admin/auth";
import { LayoutDashboard, BookOpen, LayoutGrid } from "lucide-react";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const isAuthenticated = await verifyAdminSession();

    if (!isAuthenticated) {
        redirect("/admin-login");
    }

    return (
        <div className="min-h-screen bg-zinc-50">
            {/* Header */}
            <header className="bg-white border-b border-zinc-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <Link href="/admin" className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
                                <BookOpen className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-semibold text-zinc-900">Lifebook Admin</span>
                        </Link>

                        {/* Navigation */}
                        <nav className="flex items-center gap-1">
                            <Link
                                href="/admin"
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                            >
                                <LayoutDashboard className="w-4 h-4" />
                                <span className="hidden sm:inline">Dashboard</span>
                            </Link>

                            <Link
                                href="/admin/sections"
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                            >
                                <LayoutGrid className="w-4 h-4" />
                                <span className="hidden sm:inline">Sections</span>
                            </Link>
                            <div className="w-px h-6 bg-zinc-200 mx-2" />
                            <Link
                                href="/"
                                target="_blank"
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                            >
                                <span className="hidden sm:inline">View Site</span>
                            </Link>
                            <AdminLogoutButton />
                        </nav>
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
