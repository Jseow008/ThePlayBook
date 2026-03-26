"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
    SlidersHorizontal,
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
    initialAskOpen?: boolean;
}

const COLOR_FILTER_OPTIONS: Array<{ value: ColorFilter; label: string }> = [
    { value: "all", label: "All colors" },
    { value: "yellow", label: "Yellow" },
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
    { value: "red", label: "Red" },
    { value: "purple", label: "Purple" },
];

const DEFAULT_SELECTED_ITEM = "all" as const;
const DEFAULT_SELECTED_TYPE: ItemTypeFilter = "all";
const DEFAULT_SELECTED_COLOR: ColorFilter = "all";
const DEFAULT_SORT: SortDirection = "newest";
const VIRTUALIZATION_MIN_ITEMS = 60;
const VIRTUAL_ROW_ESTIMATE = 224;
const VIRTUAL_ROW_GAP = 12;
const VIRTUAL_OVERSCAN_PX = 720;

function getValidTypeFilter(value: string | null): ItemTypeFilter {
    return value === "note" || value === "highlight" ? value : DEFAULT_SELECTED_TYPE;
}

function getValidSortDirection(value: string | null): SortDirection {
    return value === "oldest" ? value : DEFAULT_SORT;
}

function getValidColorFilter(value: string | null): ColorFilter {
    return COLOR_FILTER_OPTIONS.some((option) => option.value === value)
        ? (value as ColorFilter)
        : DEFAULT_SELECTED_COLOR;
}

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

function findStartIndex(offsets: number[], heights: number[], target: number) {
    let low = 0;
    let high = offsets.length - 1;
    let result = 0;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const itemBottom = offsets[mid] + heights[mid];

        if (itemBottom >= target) {
            result = mid;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }

    return result;
}

function findEndIndex(offsets: number[], target: number) {
    let low = 0;
    let high = offsets.length - 1;
    let result = offsets.length - 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);

        if (offsets[mid] <= target) {
            result = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return result;
}

interface HighlightListItemProps {
    item: HighlightWithContent;
    deletePending: boolean;
    isDeleteArmed: boolean;
    onDelete: (id: string, itemType: "Note" | "Highlight") => void;
    onHeightChange?: (height: number) => void;
    style?: CSSProperties;
}

function HighlightListItem({
    item,
    deletePending,
    isDeleteArmed,
    onDelete,
    onHeightChange,
    style,
}: HighlightListItemProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const noteText = item.note_body?.trim() || null;
    const itemType = noteText ? "Note" : "Highlight";
    const normalizedColor = normalizeHighlightColor(item.color);
    const colorClasses = HIGHLIGHT_COLOR_CLASSES[normalizedColor];
    const href = getHighlightHref(item);
    const segmentTitle = item.segment?.title?.trim() || null;

    useEffect(() => {
        if (!onHeightChange) {
            return;
        }

        const node = rootRef.current;
        if (!node) {
            return;
        }

        const measure = () => {
            onHeightChange(Math.ceil(node.getBoundingClientRect().height));
        };

        measure();

        const resizeObserver = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(measure)
            : null;

        resizeObserver?.observe(node);

        return () => {
            resizeObserver?.disconnect();
        };
    }, [item.id, noteText, onHeightChange]);

    return (
        <div
            ref={rootRef}
            style={style}
            className={cn(style && "absolute left-0 right-0")}
        >
            <div className="group relative overflow-hidden rounded-2xl bg-background/30 ring-1 ring-white/8 transition-[background-color,box-shadow] hover:bg-card/40 hover:shadow-[0_18px_40px_-32px_rgba(255,255,255,0.28)]">
                <div
                    aria-hidden="true"
                    className={cn("absolute inset-y-0 left-0 w-[3px]", colorClasses.swatch)}
                />
                <div className="flex gap-2 p-3 sm:p-4">
                    {href ? (
                        <Link
                            href={href}
                            className="min-w-0 flex-1 rounded-xl px-3 py-2 transition-colors hover:bg-background/35 focus:outline-none focus:ring-2 focus:ring-primary"
                            aria-label={`${itemType} from ${segmentTitle || item.content_item?.title || "saved passage"}`}
                        >
                            <div className="flex items-start gap-3">
                                {item.content_item?.cover_image_url ? (
                                    <img
                                        src={item.content_item.cover_image_url}
                                        alt=""
                                        className="mt-0.5 h-8 w-8 shrink-0 rounded-lg object-cover"
                                    />
                                ) : (
                                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card/60 text-muted-foreground">
                                        <BookOpen className="size-4" />
                                    </div>
                                )}

                                <div className="min-w-0 flex-1">
                                    <h3 className="line-clamp-1 text-[0.98rem] font-semibold tracking-[-0.01em] text-foreground">
                                        {item.content_item?.title || "Saved passage"}
                                    </h3>

                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.76rem] text-muted-foreground">
                                        {segmentTitle && (
                                            <span className="truncate">{segmentTitle}</span>
                                        )}
                                        {segmentTitle && (
                                            <span className="text-muted-foreground/40">•</span>
                                        )}
                                        <span className="rounded-full border border-white/10 bg-card/40 px-2 py-0.5 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-foreground/78">
                                            {itemType}
                                        </span>
                                        <span className="text-muted-foreground/40">•</span>
                                        <time dateTime={item.created_at || undefined}>
                                            {item.created_at
                                                ? format(new Date(item.created_at), "MMM d, h:mm a")
                                                : "Saved passage"}
                                        </time>
                                    </div>
                                </div>
                            </div>

                            <p className="mt-4 max-w-3xl line-clamp-3 text-[0.97rem] leading-6 text-foreground/92 italic">
                                &ldquo;{item.highlighted_text}&rdquo;
                            </p>

                            {noteText && (
                                <div className="mt-4 rounded-xl border border-white/8 bg-card/45 px-3.5 py-3">
                                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                                        Your note
                                    </p>
                                    <p className="mt-1.5 line-clamp-4 max-w-3xl text-[0.88rem] leading-6 text-muted-foreground">
                                        {noteText}
                                    </p>
                                </div>
                            )}
                        </Link>
                    ) : (
                        <div className="min-w-0 flex-1 px-3 py-2">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card/60 text-muted-foreground">
                                    <BookOpen className="size-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="line-clamp-1 text-[0.98rem] font-semibold tracking-[-0.01em] text-foreground">
                                        Saved passage
                                    </h3>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.76rem] text-muted-foreground">
                                        <span className="rounded-full border border-white/10 bg-card/40 px-2 py-0.5 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-foreground/78">
                                            {itemType}
                                        </span>
                                        <span className="text-muted-foreground/40">•</span>
                                        <time dateTime={item.created_at || undefined}>
                                            {item.created_at
                                                ? format(new Date(item.created_at), "MMM d, h:mm a")
                                                : "Saved passage"}
                                        </time>
                                    </div>
                                </div>
                            </div>
                            <p className="mt-4 max-w-3xl line-clamp-3 text-[0.97rem] leading-6 text-foreground/92 italic">
                                &ldquo;{item.highlighted_text}&rdquo;
                            </p>
                            {noteText && (
                                <div className="mt-4 rounded-xl border border-white/8 bg-card/45 px-3.5 py-3">
                                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                                        Your note
                                    </p>
                                    <p className="mt-1.5 line-clamp-4 max-w-3xl text-[0.88rem] leading-6 text-muted-foreground">
                                        {noteText}
                                    </p>
                                </div>
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
                            onClick={() => onDelete(item.id, itemType)}
                            disabled={deletePending}
                            className={cn(
                                "rounded-md p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60",
                                isDeleteArmed
                                    ? "bg-destructive/12 text-destructive hover:bg-destructive/18"
                                    : "text-muted-foreground/80 hover:bg-destructive/10 hover:text-destructive"
                            )}
                            aria-label={isDeleteArmed ? `Confirm delete ${itemType.toLowerCase()}` : `Delete ${itemType.toLowerCase()}`}
                            title={isDeleteArmed ? `Click again to delete this ${itemType.toLowerCase()}` : `Delete ${itemType.toLowerCase()}`}
                        >
                            {isDeleteArmed ? <X className="size-4" /> : <Trash2 className="size-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function BrainClientPage({ initialPage, initialAskOpen = false }: BrainClientPageProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
    const [selectedItem, setSelectedItem] = useState<string | "all">(searchParams.get("item") ?? DEFAULT_SELECTED_ITEM);
    const [selectedType, setSelectedType] = useState<ItemTypeFilter>(getValidTypeFilter(searchParams.get("type")));
    const [selectedColor, setSelectedColor] = useState<ColorFilter>(getValidColorFilter(searchParams.get("color")));
    const [sortBy, setSortBy] = useState<SortDirection>(getValidSortDirection(searchParams.get("sort")));
    const [isAskOpen, setIsAskOpen] = useState(initialAskOpen);
    const [isFilterBarCompact, setIsFilterBarCompact] = useState(false);
    const [isMobileFiltersExpanded, setIsMobileFiltersExpanded] = useState(false);
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchParams.get("q") ?? "");
    const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
    const [itemHeights, setItemHeights] = useState<Record<number, number>>({});
    const [virtualRange, setVirtualRange] = useState({ start: 0, end: 0 });
    const listContainerRef = useRef<HTMLDivElement | null>(null);
    const scrollFrameRef = useRef<number | null>(null);
    const deleteArmTimeoutRef = useRef<number | null>(null);
    const previousSearchParamsRef = useRef<string | null>(null);
    const shouldRespectInitialAskOpenRef = useRef(initialAskOpen);
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

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 180);

        return () => window.clearTimeout(timeoutId);
    }, [searchQuery]);

    useEffect(() => {
        const updateCompactState = () => {
            setIsFilterBarCompact(window.scrollY > 72);
        };

        updateCompactState();
        window.addEventListener("scroll", updateCompactState, { passive: true });

        return () => {
            window.removeEventListener("scroll", updateCompactState);
        };
    }, []);

    useEffect(() => {
        if (!armedDeleteId) {
            if (deleteArmTimeoutRef.current !== null) {
                window.clearTimeout(deleteArmTimeoutRef.current);
                deleteArmTimeoutRef.current = null;
            }
            return;
        }

        deleteArmTimeoutRef.current = window.setTimeout(() => {
            setArmedDeleteId(null);
            deleteArmTimeoutRef.current = null;
        }, 3200);

        return () => {
            if (deleteArmTimeoutRef.current !== null) {
                window.clearTimeout(deleteArmTimeoutRef.current);
                deleteArmTimeoutRef.current = null;
            }
        };
    }, [armedDeleteId]);

    useEffect(() => {
        const currentQuery = searchParams.toString();
        if (previousSearchParamsRef.current === currentQuery) {
            return;
        }
        previousSearchParamsRef.current = currentQuery;

        const nextSearchQuery = searchParams.get("q") ?? "";
        const nextSelectedItem = searchParams.get("item") ?? DEFAULT_SELECTED_ITEM;
        const nextSelectedType = getValidTypeFilter(searchParams.get("type"));
        const nextSelectedColor = getValidColorFilter(searchParams.get("color"));
        const nextSortBy = getValidSortDirection(searchParams.get("sort"));
        const nextAskValue = searchParams.get("ask");
        const shouldSyncAskOpen = nextAskValue !== null || !shouldRespectInitialAskOpenRef.current;
        const nextAskOpen = nextAskValue === "1";

        setSearchQuery((current) => (current === nextSearchQuery ? current : nextSearchQuery));
        setDebouncedSearchQuery((current) => (current === nextSearchQuery ? current : nextSearchQuery));
        setSelectedItem((current) => (current === nextSelectedItem ? current : nextSelectedItem));
        setSelectedType((current) => (current === nextSelectedType ? current : nextSelectedType));
        setSelectedColor((current) => (current === nextSelectedColor ? current : nextSelectedColor));
        setSortBy((current) => (current === nextSortBy ? current : nextSortBy));

        if (shouldSyncAskOpen) {
            setIsAskOpen((current) => (current === nextAskOpen ? current : nextAskOpen));
        }

        shouldRespectInitialAskOpenRef.current = false;
    }, [searchParams]);

    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        const normalizedQuery = debouncedSearchQuery.trim();

        if (normalizedQuery) {
            params.set("q", normalizedQuery);
        } else {
            params.delete("q");
        }

        if (selectedItem !== DEFAULT_SELECTED_ITEM) {
            params.set("item", selectedItem);
        } else {
            params.delete("item");
        }

        if (selectedType !== DEFAULT_SELECTED_TYPE) {
            params.set("type", selectedType);
        } else {
            params.delete("type");
        }

        if (selectedColor !== DEFAULT_SELECTED_COLOR) {
            params.set("color", selectedColor);
        } else {
            params.delete("color");
        }

        if (sortBy !== DEFAULT_SORT) {
            params.set("sort", sortBy);
        } else {
            params.delete("sort");
        }

        if (isAskOpen) {
            params.set("ask", "1");
        } else {
            params.delete("ask");
        }

        const nextQuery = params.toString();
        const currentQuery = searchParams.toString();

        if (nextQuery !== currentQuery) {
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        }
    }, [
        debouncedSearchQuery,
        isAskOpen,
        pathname,
        router,
        searchParams,
        selectedColor,
        selectedItem,
        selectedType,
        sortBy,
    ]);

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

    const shouldVirtualize = filteredHighlights.length >= VIRTUALIZATION_MIN_ITEMS;

    useEffect(() => {
        setItemHeights({});
        setVirtualRange({
            start: 0,
            end: shouldVirtualize
                ? Math.min(filteredHighlights.length - 1, 11)
                : Math.max(filteredHighlights.length - 1, 0),
        });
    }, [filteredHighlights, shouldVirtualize]);

    const virtualMetrics = useMemo(() => {
        const offsets: number[] = [];
        const heights: number[] = [];
        let totalHeight = 0;

        filteredHighlights.forEach((_, index) => {
            offsets.push(totalHeight);
            const height = itemHeights[index] ?? VIRTUAL_ROW_ESTIMATE;
            heights.push(height);
            totalHeight += height + VIRTUAL_ROW_GAP;
        });

        if (filteredHighlights.length > 0) {
            totalHeight -= VIRTUAL_ROW_GAP;
        }

        return { offsets, heights, totalHeight };
    }, [filteredHighlights, itemHeights]);

    useEffect(() => {
        if (!shouldVirtualize) {
            return;
        }

        const updateVisibleRange = () => {
            const container = listContainerRef.current;
            if (!container || virtualMetrics.offsets.length === 0) {
                return;
            }

            const rect = container.getBoundingClientRect();
            const visibleTop = Math.max(0, -rect.top - VIRTUAL_OVERSCAN_PX);
            const visibleBottom = Math.max(0, -rect.top + window.innerHeight + VIRTUAL_OVERSCAN_PX);
            const start = findStartIndex(virtualMetrics.offsets, virtualMetrics.heights, visibleTop);
            const end = findEndIndex(virtualMetrics.offsets, visibleBottom);

            setVirtualRange((current) => (
                current.start === start && current.end === end
                    ? current
                    : { start, end }
            ));
        };

        const scheduleUpdate = () => {
            if (scrollFrameRef.current !== null) {
                window.cancelAnimationFrame(scrollFrameRef.current);
            }

            scrollFrameRef.current = window.requestAnimationFrame(() => {
                updateVisibleRange();
            });
        };

        updateVisibleRange();
        window.addEventListener("scroll", scheduleUpdate, { passive: true });
        window.addEventListener("resize", scheduleUpdate);

        return () => {
            if (scrollFrameRef.current !== null) {
                window.cancelAnimationFrame(scrollFrameRef.current);
                scrollFrameRef.current = null;
            }
            window.removeEventListener("scroll", scheduleUpdate);
            window.removeEventListener("resize", scheduleUpdate);
        };
    }, [shouldVirtualize, virtualMetrics]);

    const hasFilters =
        searchQuery.trim().length > 0
        || selectedItem !== DEFAULT_SELECTED_ITEM
        || selectedType !== DEFAULT_SELECTED_TYPE
        || selectedColor !== DEFAULT_SELECTED_COLOR;

    const hasCustomSort = sortBy !== DEFAULT_SORT;
    const hasActiveControls = hasFilters || hasCustomSort;

    const selectedItemTitle = useMemo(
        () => uniqueItems.find((item) => item.id === selectedItem)?.title ?? null,
        [selectedItem, uniqueItems]
    );

    const activeFilterChips = useMemo(() => {
        const chips: Array<{
            key: string;
            label: string;
            onRemove: () => void;
        }> = [];

        if (searchQuery.trim()) {
            chips.push({
                key: "q",
                label: `Search: "${searchQuery.trim()}"`,
                onRemove: () => setSearchQuery(""),
            });
        }

        if (selectedItem !== DEFAULT_SELECTED_ITEM) {
            chips.push({
                key: "item",
                label: selectedItemTitle ? `Content: ${selectedItemTitle}` : "Content filter",
                onRemove: () => setSelectedItem(DEFAULT_SELECTED_ITEM),
            });
        }

        if (selectedType !== DEFAULT_SELECTED_TYPE) {
            chips.push({
                key: "type",
                label: selectedType === "note" ? "Notes only" : "Highlights only",
                onRemove: () => setSelectedType(DEFAULT_SELECTED_TYPE),
            });
        }

        if (selectedColor !== DEFAULT_SELECTED_COLOR) {
            chips.push({
                key: "color",
                label: `${selectedColor[0].toUpperCase()}${selectedColor.slice(1)} highlights`,
                onRemove: () => setSelectedColor(DEFAULT_SELECTED_COLOR),
            });
        }

        if (sortBy !== DEFAULT_SORT) {
            chips.push({
                key: "sort",
                label: sortBy === "oldest" ? "Oldest first" : "Newest first",
                onRemove: () => setSortBy(DEFAULT_SORT),
            });
        }

        return chips;
    }, [searchQuery, selectedItem, selectedItemTitle, selectedType, selectedColor, sortBy]);
    const activeFilterCount = activeFilterChips.length;

    const resultLabel = `${filteredHighlights.length} ${filteredHighlights.length === 1 ? "result" : "results"}`;

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
        if (armedDeleteId !== id) {
            setArmedDeleteId(id);
            return;
        }

        try {
            await deleteHighlight.mutateAsync(id);
            setArmedDeleteId(null);
            toast.success("Highlight deleted");
        } catch (error: any) {
            toast.error(error.message || "Failed to delete highlight");
        }
    };

    const toggleAskPanel = () => {
        setIsAskOpen((current) => !current);
    };

    const clearAllControls = () => {
        setSearchQuery("");
        setSelectedItem(DEFAULT_SELECTED_ITEM);
        setSelectedType(DEFAULT_SELECTED_TYPE);
        setSelectedColor(DEFAULT_SELECTED_COLOR);
        setSortBy(DEFAULT_SORT);
        setIsMobileFiltersExpanded(false);
    };

    const updateSelectedItem = (value: string | "all") => {
        setSelectedItem(value);
    };

    const updateSortBy = (value: SortDirection) => {
        setSortBy(value);
    };

    const updateSelectedType = (value: ItemTypeFilter) => {
        setSelectedType(value);
    };

    const updateSelectedColor = (value: ColorFilter) => {
        setSelectedColor(value);
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
                    isAskOpen && "lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_25rem]"
                )}>
                    <div className={cn("min-w-0", !isAskOpen && "lg:mx-auto lg:max-w-4xl lg:w-full")}>
                        <div className="sticky top-4 z-10 mb-8 lg:hidden">
                            <div className="rounded-2xl border border-white/10 bg-background/92 p-3 shadow-[0_18px_36px_-30px_rgba(0,0,0,0.7)] backdrop-blur-sm">
                                <div className="flex flex-col gap-2.5">
                                    <label className="relative">
                                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="Search notes, highlights, books, sections"
                                            value={searchQuery}
                                            onChange={(event) => setSearchQuery(event.target.value)}
                                            className="h-10 w-full rounded-xl border border-white/10 bg-card/35 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </label>

                                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full border border-white/10 bg-card/35 px-2.5 py-1 text-foreground/88">
                                                {resultLabel}
                                            </span>
                                            <span>from {highlights.length} loaded entries</span>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setIsMobileFiltersExpanded((current) => !current)}
                                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/35 px-3 py-1.5 font-medium text-foreground/85 transition-colors hover:bg-card/50 hover:text-foreground"
                                            aria-expanded={isMobileFiltersExpanded}
                                        >
                                            <SlidersHorizontal className="size-3.5" />
                                            Filters
                                            {activeFilterCount > 0 && (
                                                <span className="rounded-full bg-primary/14 px-1.5 py-0.5 text-[0.65rem] text-primary">
                                                    {activeFilterCount}
                                                </span>
                                            )}
                                        </button>
                                    </div>

                                    {activeFilterChips.length > 0 && (
                                        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                            {activeFilterChips.map((chip) => (
                                                <button
                                                    key={chip.key}
                                                    type="button"
                                                    onClick={chip.onRemove}
                                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-card/35 px-2.5 py-1 text-xs text-foreground/88 transition-colors hover:bg-card/50 hover:text-foreground"
                                                >
                                                    <span className="max-w-[14rem] truncate">{chip.label}</span>
                                                    <X className="size-3.5 text-muted-foreground" />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {isMobileFiltersExpanded && (
                                        <div className="flex flex-col gap-2.5 border-t border-white/5 pt-2.5">
                                            <label className="relative">
                                                <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                                <select
                                                    value={selectedItem}
                                                    onChange={(event) => updateSelectedItem(event.target.value)}
                                                    className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-card/35 pl-9 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                >
                                                    <option value="all">All content</option>
                                                    {selectedItem !== DEFAULT_SELECTED_ITEM && !selectedItemTitle && (
                                                        <option value={selectedItem}>Selected content</option>
                                                    )}
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
                                                    onChange={(event) => updateSortBy(event.target.value as SortDirection)}
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
                                                    onChange={(event) => updateSelectedType(event.target.value as ItemTypeFilter)}
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
                                                    onChange={(event) => updateSelectedColor(event.target.value as ColorFilter)}
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

                                            {hasActiveControls && (
                                                <div className="flex items-center justify-between gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={clearAllControls}
                                                        className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-card/50 hover:text-foreground"
                                                    >
                                                        Clear filters
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsMobileFiltersExpanded(false)}
                                                        className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            )}

                                            {!hasActiveControls && (
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsMobileFiltersExpanded(false)}
                                                        className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className={cn(
                            "sticky top-4 z-10 mb-8 hidden rounded-2xl border border-white/10 bg-background/90 backdrop-blur-sm transition-all duration-200 lg:block",
                            isFilterBarCompact
                                ? "p-3 shadow-[0_18px_36px_-30px_rgba(0,0,0,0.7)]"
                                : "p-4"
                        )}>
                            <div className={cn("flex flex-col transition-all duration-200", isFilterBarCompact ? "gap-2.5" : "gap-3")}>
                                <label className="relative">
                                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search notes, highlights, books, sections"
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        className={cn(
                                            "w-full rounded-xl border border-white/10 bg-card/35 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/70 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary",
                                            isFilterBarCompact ? "h-10" : "h-11"
                                        )}
                                    />
                                </label>

                                <div className={cn(
                                    "grid sm:grid-cols-2 transition-all duration-200",
                                    isFilterBarCompact ? "gap-2.5" : "gap-3",
                                    isAskOpen ? "xl:grid-cols-4" : "lg:grid-cols-4"
                                )}>
                                    <label className="relative">
                                        <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <select
                                            value={selectedItem}
                                            onChange={(event) => setSelectedItem(event.target.value)}
                                            className={cn(
                                                "w-full appearance-none rounded-xl border border-white/10 bg-card/35 pl-9 pr-10 text-sm text-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary",
                                                isFilterBarCompact ? "h-9" : "h-10"
                                            )}
                                        >
                                            <option value="all">All content</option>
                                            {selectedItem !== DEFAULT_SELECTED_ITEM && !selectedItemTitle && (
                                                <option value={selectedItem}>Selected content</option>
                                            )}
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
                                            className={cn(
                                                "w-full appearance-none rounded-xl border border-white/10 bg-card/35 px-4 pr-10 text-sm text-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary",
                                                isFilterBarCompact ? "h-9" : "h-10"
                                            )}
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
                                            className={cn(
                                                "w-full appearance-none rounded-xl border border-white/10 bg-card/35 px-4 pr-10 text-sm text-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary",
                                                isFilterBarCompact ? "h-9" : "h-10"
                                            )}
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
                                            className={cn(
                                                "w-full appearance-none rounded-xl border border-white/10 bg-card/35 px-4 pr-10 text-sm text-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary",
                                                isFilterBarCompact ? "h-9" : "h-10"
                                            )}
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

                                <div className={cn(
                                    "flex flex-col border-t border-white/5 transition-all duration-200",
                                    isFilterBarCompact ? "gap-2 pt-2.5" : "gap-3 pt-3"
                                )}>
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full border border-white/10 bg-card/35 px-2.5 py-1 text-foreground/88">
                                                {resultLabel}
                                            </span>
                                            <span>from {highlights.length} loaded entries</span>
                                        </div>

                                        {hasActiveControls && (
                                            <button
                                                type="button"
                                                onClick={clearAllControls}
                                                className="rounded-full border border-white/10 px-3 py-1 font-medium text-foreground/80 transition-colors hover:bg-card/50 hover:text-foreground"
                                            >
                                                Clear filters
                                            </button>
                                        )}
                                    </div>

                                    {activeFilterChips.length > 0 && (
                                        <div className={cn(
                                            "flex gap-2",
                                            isFilterBarCompact
                                                ? "overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                                : "flex-wrap"
                                        )}>
                                            {activeFilterChips.map((chip) => (
                                                <button
                                                    key={chip.key}
                                                    type="button"
                                                    onClick={chip.onRemove}
                                                    className={cn(
                                                        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-card/35 text-xs text-foreground/88 transition-colors hover:bg-card/50 hover:text-foreground",
                                                        isFilterBarCompact ? "shrink-0 px-2.5 py-1" : "px-3 py-1.5"
                                                    )}
                                                >
                                                    <span className="max-w-[16rem] truncate">{chip.label}</span>
                                                    <X className="size-3.5 text-muted-foreground" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
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
                                {hasActiveControls && (
                                    <button
                                        type="button"
                                        onClick={clearAllControls}
                                        className="mt-5 inline-flex rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-card/50 hover:text-foreground"
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div ref={listContainerRef}>
                                {shouldVirtualize ? (
                                    <div
                                        className="relative"
                                        style={{ height: virtualMetrics.totalHeight }}
                                    >
                                        {filteredHighlights
                                            .slice(virtualRange.start, virtualRange.end + 1)
                                            .map((item, visibleIndex) => {
                                                const index = virtualRange.start + visibleIndex;

                                                return (
                                                    <HighlightListItem
                                                        key={item.id}
                                                        item={item}
                                                        deletePending={deleteHighlight.isPending}
                                                        isDeleteArmed={armedDeleteId === item.id}
                                                        onDelete={(id) => {
                                                            void handleDelete(id);
                                                        }}
                                                        onHeightChange={(height) => {
                                                            setItemHeights((current) => (
                                                                current[index] === height
                                                                    ? current
                                                                    : { ...current, [index]: height }
                                                            ));
                                                        }}
                                                        style={{
                                                            top: virtualMetrics.offsets[index],
                                                        }}
                                                    />
                                                );
                                            })}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {filteredHighlights.map((item) => (
                                            <HighlightListItem
                                                key={item.id}
                                                item={item}
                                                deletePending={deleteHighlight.isPending}
                                                isDeleteArmed={armedDeleteId === item.id}
                                                onDelete={(id) => {
                                                    void handleDelete(id);
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
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
                    <div className="absolute inset-x-0 bottom-0 max-h-[88vh] px-3 pb-3">
                        <div className="relative z-10 mb-2">
                            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-white/18" />
                            <div className="rounded-[20px] border border-white/10 bg-background/92 px-4 py-3 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm">
                                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                                    Current scope
                                </p>
                                <div className="flex flex-wrap items-center gap-2 text-[0.72rem]">
                                    <span className="rounded-full border border-white/10 bg-card/45 px-2.5 py-1 text-foreground/88">
                                        {notesChatScope.noteCount} {notesChatScope.noteCount === 1 ? "note" : "notes"} in scope
                                    </span>
                                    {notesChatScope.totalMatches > notesChatScope.noteCount && (
                                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary">
                                            Using {notesChatScope.noteCount} most recent
                                        </span>
                                    )}
                                </div>
                                <p className="mt-2 line-clamp-2 text-[0.72rem] leading-relaxed text-muted-foreground">
                                    {notesChatScope.summary}
                                </p>
                            </div>
                        </div>

                        <div className="relative z-10">
                        <NotesAskPanel
                            currentScope={notesChatScope}
                            onClose={toggleAskPanel}
                            mobile
                        />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
