"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
    BotMessageSquare,
    BookOpen,
    ChevronDown,
    ExternalLink,
    Filter,
    Highlighter,
    Loader2,
    Search,
    Trash2,
    X,
} from "lucide-react";
import {
    useDeleteHighlight,
    useInfiniteHighlights,
    type HighlightsPage,
    type HighlightWithContent,
} from "@/hooks/useHighlights";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_COLOR_CLASSES, normalizeHighlightColor } from "@/lib/highlight-utils";
import { NotesAskPanel, type NotesChatScope } from "@/components/notes/NotesAskPanel";

type ItemTypeFilter = "all" | "note" | "highlight";
type SortDirection = "newest" | "oldest";
type ColorFilter = "all" | "yellow" | "blue" | "green" | "red" | "purple";

interface BrainClientPageProps {
    initialPage: HighlightsPage;
}

const COLOR_FILTER_OPTIONS: Array<{ value: ColorFilter; label: string }> = [
    { value: "all", label: "All colors" },
    { value: "yellow", label: "Yellow" },
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
    { value: "red", label: "Red" },
    { value: "purple", label: "Purple" },
];

function getHighlightHref(item: HighlightWithContent) {
    if (!item.content_item?.id) {
        return null;
    }

    return `/read/${item.content_item.id}?highlightId=${item.id}`;
}

function buildScopeSummary({
    selectedItemTitle,
    selectedType,
    selectedColor,
    searchQuery,
}: {
    selectedItemTitle: string | null;
    selectedType: ItemTypeFilter;
    selectedColor: ColorFilter;
    searchQuery: string;
}) {
    const parts: string[] = [];

    if (selectedItemTitle) {
        parts.push(selectedItemTitle);
    }

    if (selectedType !== "all") {
        parts.push(selectedType === "note" ? "notes only" : "highlights only");
    }

    if (selectedColor !== "all") {
        parts.push(`${selectedColor} highlights`);
    }

    if (searchQuery.trim()) {
        parts.push(`search: "${searchQuery.trim()}"`);
    }

    return parts.join(" • ") || "All content";
}

export function BrainClientPage({ initialPage }: BrainClientPageProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedItem, setSelectedItem] = useState<string | "all">("all");
    const [selectedType, setSelectedType] = useState<ItemTypeFilter>("all");
    const [selectedColor, setSelectedColor] = useState<ColorFilter>("all");
    const [sortBy, setSortBy] = useState<SortDirection>("newest");
    const [isAskOpen, setIsAskOpen] = useState(false);
    const deleteHighlight = useDeleteHighlight();
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        isError,
    } = useInfiniteHighlights(undefined, { initialPage });

    const highlights = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? initialPage.data,
        [data, initialPage.data]
    );

    const uniqueItems = useMemo(() => {
        const map = new Map<string, { id: string; title: string }>();
        highlights.forEach((highlight) => {
            if (highlight.content_item) {
                map.set(highlight.content_item.id, {
                    id: highlight.content_item.id,
                    title: highlight.content_item.title,
                });
            }
        });
        return Array.from(map.values());
    }, [highlights]);

    const filteredHighlights = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();

        return [...highlights]
            .filter((highlight) => {
                const noteText = highlight.note_body?.trim() || null;
                const itemType = noteText ? "note" : "highlight";
                const normalizedColor = normalizeHighlightColor(highlight.color);

                const matchesSearch =
                    !normalizedQuery
                    || highlight.highlighted_text.toLowerCase().includes(normalizedQuery)
                    || noteText?.toLowerCase().includes(normalizedQuery)
                    || highlight.content_item?.title.toLowerCase().includes(normalizedQuery)
                    || highlight.segment?.title?.toLowerCase().includes(normalizedQuery);

                const matchesItem = selectedItem === "all" || highlight.content_item?.id === selectedItem;
                const matchesType = selectedType === "all" || itemType === selectedType;
                const matchesColor = selectedColor === "all" || normalizedColor === selectedColor;

                return matchesSearch && matchesItem && matchesType && matchesColor;
            })
            .sort((left, right) => {
                const leftDate = new Date(left.created_at || 0).getTime();
                const rightDate = new Date(right.created_at || 0).getTime();
                return sortBy === "newest" ? rightDate - leftDate : leftDate - rightDate;
            });
    }, [highlights, searchQuery, selectedItem, selectedType, selectedColor, sortBy]);

    const hasFilters =
        searchQuery.trim().length > 0
        || selectedItem !== "all"
        || selectedType !== "all"
        || selectedColor !== "all";

    const selectedItemTitle = useMemo(
        () => uniqueItems.find((item) => item.id === selectedItem)?.title ?? null,
        [selectedItem, uniqueItems]
    );

    const notesChatScope = useMemo<NotesChatScope>(() => {
        const scopedHighlights = filteredHighlights.slice(0, 40);

        return {
            highlightIds: scopedHighlights.map((item) => item.id),
            noteCount: scopedHighlights.length,
            totalMatches: filteredHighlights.length,
            summary: buildScopeSummary({
                selectedItemTitle,
                selectedType,
                selectedColor,
                searchQuery,
            }),
            signature: JSON.stringify({
                ids: scopedHighlights.map((item) => item.id),
                totalMatches: filteredHighlights.length,
                selectedItem,
                selectedType,
                selectedColor,
                searchQuery: searchQuery.trim(),
                sortBy,
            }),
        };
    }, [
        filteredHighlights,
        searchQuery,
        selectedColor,
        selectedItem,
        selectedItemTitle,
        selectedType,
        sortBy,
    ]);

    const handleDelete = async (id: string) => {
        try {
            await deleteHighlight.mutateAsync(id);
            toast.success("Highlight deleted");
        } catch (error: any) {
            toast.error(error.message || "Failed to delete highlight");
        }
    };

    const toggleAskPanel = () => {
        setIsAskOpen((current) => !current);
    };

    return (
        <div className="min-h-screen bg-background font-sans text-foreground pb-8 lg:pb-24">
            <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-12">
                <div className={cn(!isAskOpen && "mx-auto max-w-4xl")}>
                    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-col gap-3">
                            <h1 className="text-3xl font-bold text-foreground font-display tracking-tight leading-tight">
                                Notes
                            </h1>
                            <p className="text-sm text-muted-foreground max-w-2xl">
                                Review highlights across your library, filter what matters, and jump back to the exact saved passage.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={toggleAskPanel}
                            aria-pressed={isAskOpen}
                            className={cn(
                                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                                isAskOpen
                                    ? "border-primary/30 bg-primary/15 text-primary hover:bg-primary/20"
                                    : "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
                            )}
                        >
                            {isAskOpen ? <X className="size-4" /> : <BotMessageSquare className="size-4" />}
                            {isAskOpen ? "Close notes AI" : "Ask these notes"}
                        </button>
                    </div>
                </div>

                <div className={cn(
                    "grid gap-6 lg:items-start",
                    isAskOpen && "lg:grid-cols-[minmax(0,1fr)_27rem]"
                )}>
                    <div className={cn("min-w-0", !isAskOpen && "lg:mx-auto lg:max-w-4xl lg:w-full")}>
                        <div className="sticky top-4 z-10 mb-8 rounded-2xl border border-white/10 bg-background/90 p-4 backdrop-blur-sm">
                            <div className="flex flex-col gap-3">
                                <label className="relative">
                                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search notes, highlights, books, sections"
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        className="h-11 w-full rounded-xl border border-white/10 bg-card/35 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </label>

                                <div className={cn(
                                    "grid gap-3 sm:grid-cols-2",
                                    isAskOpen ? "xl:grid-cols-4" : "lg:grid-cols-4"
                                )}>
                                    <label className="relative">
                                        <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <select
                                            value={selectedItem}
                                            onChange={(event) => setSelectedItem(event.target.value)}
                                            className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-card/35 pl-9 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            <option value="all">All content</option>
                                            {uniqueItems.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.title}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    </label>

                                    <label className="relative">
                                        <select
                                            value={sortBy}
                                            onChange={(event) => setSortBy(event.target.value as SortDirection)}
                                            className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-card/35 px-4 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            <option value="newest">Newest first</option>
                                            <option value="oldest">Oldest first</option>
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    </label>

                                    <label className="relative">
                                        <select
                                            value={selectedType}
                                            onChange={(event) => setSelectedType(event.target.value as ItemTypeFilter)}
                                            className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-card/35 px-4 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            <option value="all">All types</option>
                                            <option value="note">Notes</option>
                                            <option value="highlight">Highlights</option>
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    </label>

                                    <label className="relative">
                                        <select
                                            value={selectedColor}
                                            onChange={(event) => setSelectedColor(event.target.value as ColorFilter)}
                                            className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-card/35 px-4 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            {COLOR_FILTER_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((item) => (
                                    <div key={item} className="h-28 rounded-2xl bg-card/40 animate-pulse" />
                                ))}
                            </div>
                        ) : isError ? (
                            <div className="rounded-2xl border border-white/10 bg-card/20 px-6 py-16 text-center text-muted-foreground">
                                Failed to load notes.
                            </div>
                        ) : filteredHighlights.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-card/20 px-6 py-16 text-center text-muted-foreground">
                                <BookOpen className="size-12 mx-auto mb-4 opacity-25" />
                                <h3 className="mb-2 text-lg font-medium text-foreground">No notes found</h3>
                                <p className="mx-auto max-w-md">
                                    {hasFilters
                                        ? "No highlights match your current filters."
                                        : "You have not highlighted anything yet. Start reading and save passages to build your notes."}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredHighlights.map((item) => {
                                    const noteText = item.note_body?.trim() || null;
                                    const itemType = noteText ? "Note" : "Highlight";
                                    const normalizedColor = normalizeHighlightColor(item.color);
                                    const colorClasses = HIGHLIGHT_COLOR_CLASSES[normalizedColor];
                                    const href = getHighlightHref(item);
                                    const segmentTitle = item.segment?.title?.trim() || null;

                                    return (
                                        <div
                                            key={item.id}
                                            className="group relative overflow-hidden rounded-xl bg-background/30 ring-1 ring-white/8 transition-colors hover:bg-card/40"
                                        >
                                            <div
                                                aria-hidden="true"
                                                className={cn("absolute inset-y-0 left-0 w-[3px]", colorClasses.swatch)}
                                            />
                                            <div className="flex gap-2 p-3 sm:p-4">
                                                {href ? (
                                                    <Link
                                                        href={href}
                                                        className="min-w-0 flex-1 rounded-lg px-3 py-2 transition-colors hover:bg-background/35 focus:outline-none focus:ring-2 focus:ring-primary"
                                                        aria-label={`${itemType} from ${segmentTitle || item.content_item?.title || "saved passage"}`}
                                                    >
                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.79rem] text-muted-foreground">
                                                            {item.content_item && (
                                                                <span className="inline-flex min-w-0 items-center gap-2 text-foreground/88">
                                                                    {item.content_item.cover_image_url && (
                                                                        <img
                                                                            src={item.content_item.cover_image_url}
                                                                            alt=""
                                                                            className="h-5 w-5 rounded-md object-cover"
                                                                        />
                                                                    )}
                                                                    <span className="truncate font-medium">
                                                                        {item.content_item.title}
                                                                    </span>
                                                                </span>
                                                            )}
                                                            {segmentTitle && (
                                                                <>
                                                                    <span className="text-muted-foreground/50">•</span>
                                                                    <span className="truncate">{segmentTitle}</span>
                                                                </>
                                                            )}
                                                            <span className="text-muted-foreground/50">•</span>
                                                            <span>{itemType}</span>
                                                        </div>

                                                        <div className="mt-1 text-[0.78rem] text-muted-foreground/85">
                                                            <time dateTime={item.created_at || undefined}>
                                                                {item.created_at
                                                                    ? format(new Date(item.created_at), "MMM d, h:mm a")
                                                                    : "Saved passage"}
                                                            </time>
                                                        </div>

                                                        <p className="mt-3 max-w-3xl text-[0.97rem] leading-6 text-foreground/92 italic">
                                                            &ldquo;{item.highlighted_text}&rdquo;
                                                        </p>

                                                        {noteText && (
                                                            <p className="mt-3 max-w-3xl text-[0.88rem] leading-6 text-muted-foreground">
                                                                {noteText}
                                                            </p>
                                                        )}
                                                    </Link>
                                                ) : (
                                                    <div className="min-w-0 flex-1 px-3 py-2">
                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.79rem] text-muted-foreground">
                                                            <span>{itemType}</span>
                                                        </div>
                                                        <div className="mt-1 text-[0.78rem] text-muted-foreground/85">
                                                            <time dateTime={item.created_at || undefined}>
                                                                {item.created_at
                                                                    ? format(new Date(item.created_at), "MMM d, h:mm a")
                                                                    : "Saved passage"}
                                                            </time>
                                                        </div>
                                                        <p className="mt-3 max-w-3xl text-[0.97rem] leading-6 text-foreground/92 italic">
                                                            &ldquo;{item.highlighted_text}&rdquo;
                                                        </p>
                                                        {noteText && (
                                                            <p className="mt-3 max-w-3xl text-[0.88rem] leading-6 text-muted-foreground">
                                                                {noteText}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="flex shrink-0 items-start gap-1 pt-1">
                                                    {href && (
                                                        <Link
                                                            href={href}
                                                            className="rounded-md p-2 text-muted-foreground/80 transition-colors hover:bg-background/40 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                            aria-label={`Open ${itemType.toLowerCase()} in reader`}
                                                        >
                                                            <ExternalLink className="size-4" />
                                                        </Link>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(item.id)}
                                                        disabled={deleteHighlight.isPending}
                                                        className="rounded-md p-2 text-muted-foreground/80 transition-colors hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-primary"
                                                        aria-label={`Delete ${itemType.toLowerCase()}`}
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {hasNextPage && (
                            <div className="mt-6 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/40 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card/60 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : <Highlighter className="size-4" />}
                                    {isFetchingNextPage ? "Loading more" : "Load more notes"}
                                </button>
                            </div>
                        )}
                    </div>

                    {isAskOpen && (
                        <aside className="hidden lg:block lg:self-start">
                            <div className="sticky top-6">
                                <NotesAskPanel
                                    currentScope={notesChatScope}
                                    onClose={toggleAskPanel}
                                    variant="sidebar"
                                />
                            </div>
                        </aside>
                    )}
                </div>
            </main>

            {isAskOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden">
                    <button
                        type="button"
                        className="absolute inset-0"
                        aria-label="Close notes AI panel backdrop"
                        onClick={toggleAskPanel}
                    />
                    <div className="absolute inset-x-0 bottom-0 max-h-[88vh]">
                        <NotesAskPanel
                            currentScope={notesChatScope}
                            onClose={toggleAskPanel}
                            mobile
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
