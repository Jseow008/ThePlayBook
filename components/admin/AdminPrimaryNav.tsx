"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpenText, Inbox, LayoutDashboard, LayoutGrid, Layers3 } from "lucide-react";

const NAV_ITEMS = [
    {
        href: "/admin",
        label: "Dashboard",
        Icon: LayoutDashboard,
        match: (pathname: string) => pathname === "/admin",
    },
    {
        href: "/admin/content",
        label: "Content",
        Icon: BookOpenText,
        match: (pathname: string) => pathname.startsWith("/admin/content"),
    },
    {
        href: "/admin/requests",
        label: "Requests",
        Icon: Inbox,
        match: (pathname: string) => pathname.startsWith("/admin/requests"),
    },
    {
        href: "/admin/sections",
        label: "Sections",
        Icon: LayoutGrid,
        match: (pathname: string) => pathname.startsWith("/admin/sections"),
    },
    {
        href: "/admin/series",
        label: "Series",
        Icon: Layers3,
        match: (pathname: string) => pathname.startsWith("/admin/series"),
    },
    {
        href: "/admin/insights",
        label: "Insights",
        Icon: BarChart3,
        match: (pathname: string) => pathname.startsWith("/admin/insights"),
    },
] as const;

export function AdminPrimaryNav() {
    const pathname = usePathname();

    return (
        <nav className="flex flex-wrap items-center gap-1">
            {NAV_ITEMS.map(({ href, label, Icon, match }) => {
                const isActive = match(pathname);

                return (
                    <Link
                        key={href}
                        href={href}
                        className={`focus-ring flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                                ? "bg-zinc-900 text-white"
                                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        }`}
                    >
                        <Icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
