"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Search, Filter, Trash2, ExternalLink, ArrowLeft } from "lucide-react";
import { useDeleteHighlight, type HighlightWithContent } from "@/hooks/useHighlights";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function BrainClientPage({ initialHighlights }: { initialHighlights: any[] }) {
    // We start with server-rendered highlights but we can let React Query take over if needed
    const [highlights, setHighlights] = useState<HighlightWithContent[]>(initialHighlights as HighlightWithContent[]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedItem, setSelectedItem] = useState<string | "all">("all");

    const deleteHighlight = useDeleteHighlight();
    const queryClient = useQueryClient();

    // Extract unique books for filter
    const uniqueItems = useMemo(() => {
        const map = new Map<string, { id: string; title: string }>();
        highlights.forEach((h) => {
            if (h.content_item) {
                map.set(h.content_item.id, { id: h.content_item.id, title: h.content_item.title });
            }
        });
        return Array.from(map.values());
    }, [highlights]);

    // Filter highlights
    const filteredHighlights = useMemo(() => {
        return highlights.filter((h) => {
            const matchesSearch =
                h.highlighted_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (h.note_body && h.note_body.toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesItem = selectedItem === "all" || h.content_item?.id === selectedItem;

            return matchesSearch && matchesItem;
        });
    }, [highlights, searchQuery, selectedItem]);

    const handleDelete = async (id: string) => {
        try {
            await deleteHighlight.mutateAsync(id);
            // Optimistic local update
            setHighlights((prev) => prev.filter((h) => h.id !== id));
            toast.success("Highlight deleted");
            queryClient.invalidateQueries({ queryKey: ["highlights"] });
        } catch (error: any) {
            toast.error(error.message || "Failed to delete highlight");
        }
    };

    return (
        <div className="min-h-screen bg-background font-sans text-foreground">
            <main className="max-w-5xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
                {/* Back to Library */}
                <div className="mb-8">
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground transition-all group"
                    >
                        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
                        <span>Back to Library</span>
                    </Link>
                </div>
                <div className="flex flex-col gap-4 mb-8">
                    <h1 className="text-3xl font-bold text-foreground font-display tracking-tight leading-tight">
                        Second Brain
                    </h1>
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-4 mb-8">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search your notes and highlights..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 pl-9 pr-4 rounded-md border border-white/10 bg-card/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/60"
                        />
                    </div>
                    {uniqueItems.length > 0 && (
                        <div className="relative min-w-[200px]">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <select
                                value={selectedItem}
                                onChange={(e) => setSelectedItem(e.target.value)}
                                className="w-full h-10 pl-9 pr-4 rounded-md border border-white/10 bg-card/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
                            >
                                <option value="all">All Content</option>
                                {uniqueItems.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.title.length > 30 ? item.title.substring(0, 30) + '...' : item.title}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredHighlights.length === 0 ? (
                        <div className="col-span-full py-16 flex flex-col items-center justify-center text-center text-muted-foreground border border-dashed border-white/10 rounded-2xl bg-card/20">
                            <BookOpen className="size-12 mb-4 opacity-20" />
                            <h3 className="text-lg font-medium text-foreground mb-1">No notes found</h3>
                            <p className="max-w-sm">
                                {searchQuery || selectedItem !== "all"
                                    ? "No highlights match your current search filters."
                                    : "You haven't highlighted anything yet. Read some content and select text to start building your second brain!"}
                            </p>
                        </div>
                    ) : (
                        filteredHighlights.map((item) => (
                            <div
                                key={item.id}
                                className="group flex flex-col bg-card/40 border border-white/10 rounded-2xl hover:border-white/20 transition-all p-5 shadow-sm hover:shadow-md"
                            >
                                {/* Source Reference */}
                                {item.content_item && (
                                    <Link
                                        href={`/read/${item.content_item.id}`}
                                        className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary transition-colors mb-4"
                                    >
                                        {item.content_item.cover_image_url && (
                                            <img
                                                src={item.content_item.cover_image_url}
                                                alt=""
                                                className="w-5 h-5 rounded object-cover"
                                            />
                                        )}
                                        <span className="truncate">{item.content_item.title}</span>
                                        <ExternalLink className="size-3 flex-shrink-0" />
                                    </Link>
                                )}

                                {/* Highlight */}
                                <div className="relative pl-3 border-l-2 border-yellow-500/50 mb-4 flex-1">
                                    <p className="text-[0.95rem] leading-relaxed text-foreground/90 italic">
                                        "{item.highlighted_text}"
                                    </p>
                                </div>

                                {/* Custom Note */}
                                {item.note_body && (
                                    <div className="mb-4 p-3 rounded-xl bg-secondary/50 text-sm leading-relaxed text-foreground/80 border border-white/5">
                                        {item.note_body}
                                    </div>
                                )}

                                {/* Footer & Actions */}
                                <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                                    <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground font-medium">
                                        {formatDistanceToNow(new Date(item.created_at || ""), { addSuffix: false })}
                                    </span>

                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleDelete(item.id);
                                        }}
                                        disabled={deleteHighlight.isPending}
                                        className="p-1.5 text-muted-foreground/60 hover:text-white hover:bg-destructive/80 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus-ring"
                                        aria-label="Delete note"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
