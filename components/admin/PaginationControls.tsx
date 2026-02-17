"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationControlsProps {
    currentPage: number;
    totalPages: number;
    paramName?: string; // default 'page'
}

export function PaginationControls({
    currentPage,
    totalPages,
    paramName = "page",
}: PaginationControlsProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [jumpPage, setJumpPage] = useState<string>("");

    // Helper to build links keeping current filters
    const getPageLink = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set(paramName, newPage.toString());
        return `${pathname}?${params.toString()}`;
    };

    const handleJump = (e: React.FormEvent) => {
        e.preventDefault();
        const pageNum = parseInt(jumpPage);
        if (pageNum >= 1 && pageNum <= totalPages) {
            router.push(getPageLink(pageNum));
            setJumpPage("");
        }
    };

    if (totalPages <= 1) return null;

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-border bg-muted/40">
            {/* Mobile: Simple Prev/Next */}
            <div className="flex sm:hidden w-full justify-between items-center">
                <Link
                    href={currentPage > 1 ? getPageLink(currentPage - 1) : "#"}
                    className={`p-2 rounded-md border ${currentPage > 1 ? "bg-card text-foreground" : "bg-muted text-muted-foreground opacity-50 pointer-events-none"}`}
                >
                    <ChevronLeft className="w-4 h-4" />
                </Link>
                <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                </span>
                <Link
                    href={currentPage < totalPages ? getPageLink(currentPage + 1) : "#"}
                    className={`p-2 rounded-md border ${currentPage < totalPages ? "bg-card text-foreground" : "bg-muted text-muted-foreground opacity-50 pointer-events-none"}`}
                >
                    <ChevronRight className="w-4 h-4" />
                </Link>
            </div>

            {/* Desktop: Advanced Controls */}
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                Showing page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{totalPages}</span>
            </div>

            <div className="hidden sm:flex items-center gap-2">
                {/* First Page */}
                <Link
                    href={getPageLink(1)}
                    className={`p-2 rounded-md border transition-colors ${currentPage > 1
                        ? "bg-card border-border text-foreground hover:bg-accent"
                        : "bg-muted border-border text-muted-foreground cursor-not-allowed opacity-50 pointer-events-none"
                        }`}
                    title="First Page"
                >
                    <ChevronsLeft className="w-4 h-4" />
                </Link>

                {/* Previous */}
                <Link
                    href={currentPage > 1 ? getPageLink(currentPage - 1) : "#"}
                    className={`p-2 rounded-md border transition-colors ${currentPage > 1
                        ? "bg-card border-border text-foreground hover:bg-accent"
                        : "bg-muted border-border text-muted-foreground cursor-not-allowed opacity-50 pointer-events-none"
                        }`}
                    title="Previous Page"
                >
                    <ChevronLeft className="w-4 h-4" />
                </Link>

                {/* Page Numbers */}
                <div className="flex items-center gap-1 mx-2">
                    {/* Ellipsis Logic */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let p = currentPage - 2 + i;
                        // Adjust window if near start
                        if (currentPage < 3) p = 1 + i;
                        // Adjust window if near end
                        if (currentPage > totalPages - 2) p = totalPages - 4 + i;

                        // Bounds check
                        if (p < 1 || p > totalPages) return null;

                        return (
                            <Link
                                key={p}
                                href={getPageLink(p)}
                                className={`min-w-[32px] h-8 flex items-center justify-center rounded-md border text-sm font-medium transition-colors ${p === currentPage
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-card border-border text-foreground hover:bg-accent"
                                    }`}
                            >
                                {p}
                            </Link>
                        );
                    })}
                </div>

                {/* Next */}
                <Link
                    href={currentPage < totalPages ? getPageLink(currentPage + 1) : "#"}
                    className={`p-2 rounded-md border transition-colors ${currentPage < totalPages
                        ? "bg-card border-border text-foreground hover:bg-accent"
                        : "bg-muted border-border text-muted-foreground cursor-not-allowed opacity-50 pointer-events-none"
                        }`}
                    title="Next Page"
                >
                    <ChevronRight className="w-4 h-4" />
                </Link>

                {/* Last Page */}
                <Link
                    href={getPageLink(totalPages)}
                    className={`p-2 rounded-md border transition-colors ${currentPage < totalPages
                        ? "bg-card border-border text-foreground hover:bg-accent"
                        : "bg-muted border-border text-muted-foreground cursor-not-allowed opacity-50 pointer-events-none"
                        }`}
                    title="Last Page"
                >
                    <ChevronsRight className="w-4 h-4" />
                </Link>

                {/* Go to Input */}
                <form onSubmit={handleJump} className="flex items-center gap-2 ml-4 pl-4 border-l border-border">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Go to</span>
                    <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={jumpPage}
                        onChange={(e) => setJumpPage(e.target.value)}
                        className="w-16 h-8 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="#"
                    />
                    <button
                        type="submit"
                        disabled={!jumpPage}
                        className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Go
                    </button>
                </form>
            </div>
        </div>
    );
}
