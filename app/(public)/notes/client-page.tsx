"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
    BotMessageSquare,
    BookOpen,
    Check,
    ChevronDown,
    Edit3,
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
    useUpdateHighlight,
    type HighlightsPage,
    type HighlightWithContent,
} from "@/hooks/useHighlights";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { buildCanonicalReadPath } from "@/lib/content-paths";
import { HIGHLIGHT_COLOR_CLASSES, normalizeHighlightColor, type HighlightColor } from "@/lib/highlight-utils";
import { NotesAskPanel, type NotesChatScope } from "@/components/notes/NotesAskPanel";
import { serializeNotesChatScope } from "@/lib/notes-chat-scope";

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
const NOTE_EDITOR_COLORS: HighlightColor[] = ["yellow", "blue", "green", "red", "purple"];

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

    return `${buildCanonicalReadPath(item.content_item.id, item.content_item.title)}?highlightId=${item.id}`;
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
    onEdit: (item: HighlightWithContent) => void;
    onHeightChange?: (height: number) => void;
    style?: CSSProperties;
}

function HighlightListItem({
    item,
    deletePending,
    isDeleteArmed,
    onDelete,
    onEdit,
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
                <div className="flex items-start gap-2 p-3 sm:p-4">
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

                    <div className="mt-0.5 flex shrink-0 self-start items-center gap-1 sm:gap-1.5">
                        <button
                            type="button"
                            onClick={() => onEdit(item)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/10 bg-card/35 px-2.5 py-1.5 text-[0.72rem] font-medium text-foreground/85 transition-colors hover:bg-card/55 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            aria-label={noteText ? "Edit note" : "Add note"}
                        >
                            <Edit3 className="size-3.5" />
                            <span>{noteText ? "Edit" : "Add"}</span>
                        </button>
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

interface NoteEditorOverlayProps {
    item: HighlightWithContent | null;
    draftNote: string;
    draftColor: HighlightColor;
    canSave: boolean;
    isSaving: boolean;
    onClose: () => void;
    onDraftNoteChange: (value: string) => void;
    onDraftColorChange: (value: HighlightColor) => void;
    onClearDraft: () => void;
    onSave: () => void;
}

function NoteEditorOverlay({
    item,
    draftNote,
    draftColor,
    canSave,
    isSaving,
    onClose,
    onDraftNoteChange,
    onDraftColorChange,
    onClearDraft,
    onSave,
}: NoteEditorOverlayProps) {
    if (!item) {
        return null;
    }

    const noteText = item.note_body?.trim() || "";
    const isExistingNote = noteText.length > 0;
    const colorClasses = HIGHLIGHT_COLOR_CLASSES[draftColor];
    const segmentTitle = item.segment?.title?.trim() || null;

    return (
        <div className="fixed inset-0 z-[70]">
            <button
                type="button"
                aria-label="Close note editor"
                onClick={onClose}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            <div className="absolute inset-x-0 bottom-0 flex justify-center px-0 sm:inset-0 sm:items-center sm:px-4">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="note-editor-title"
                    className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-background/96 shadow-[0_-20px_60px_-28px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:rounded-[1.75rem]"
                >
                    <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/14 sm:hidden" />

                    <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 pb-4 pt-4 sm:px-6 sm:pt-5">
                        <div className="min-w-0">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/75">
                                {isExistingNote ? "Edit note" : "Add note"}
                            </p>
                            <h2
                                id="note-editor-title"
                                className="mt-1 line-clamp-1 text-lg font-semibold text-foreground"
                            >
                                {item.content_item?.title || "Saved passage"}
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {segmentTitle || "Saved highlight"}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            aria-label="Close note editor"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="flex max-h-[78vh] flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-6">
                        <div className={cn("rounded-2xl border bg-card/40 p-4", colorClasses.border)}>
                            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/72">
                                Highlight
                            </p>
                            <p className="mt-2 text-[0.96rem] leading-7 text-foreground/92 italic">
                                &ldquo;{item.highlighted_text}&rdquo;
                            </p>
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                                    Highlight color
                                </p>
                                <span className="text-xs text-muted-foreground">
                                    Saved highlight stays linked
                                </span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {NOTE_EDITOR_COLORS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => onDraftColorChange(color)}
                                        className={cn(
                                            "flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary",
                                            draftColor === color
                                                ? "border-white/20 bg-card/70 text-foreground"
                                                : "border-white/10 bg-card/35 text-muted-foreground hover:bg-card/50 hover:text-foreground",
                                        )}
                                        aria-label={`Set highlight color to ${color}`}
                                        aria-pressed={draftColor === color}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={cn("size-2.5 rounded-full", HIGHLIGHT_COLOR_CLASSES[color].swatch)}
                                        />
                                        <span className="capitalize">{color}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-3">
                                <label
                                    htmlFor="note-editor-textarea"
                                    className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80"
                                >
                                    Your note
                                </label>
                                <button
                                    type="button"
                                    onClick={onClearDraft}
                                    disabled={draftNote.length === 0}
                                    className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Clear
                                </button>
                            </div>

                            <textarea
                                id="note-editor-textarea"
                                autoFocus
                                value={draftNote}
                                onChange={(event) => onDraftNoteChange(event.target.value)}
                                placeholder="Capture what matters about this passage."
                                className="mt-3 min-h-40 w-full rounded-2xl border border-white/10 bg-card/35 px-4 py-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground/65 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-white/8 bg-background/92 px-5 py-4 safe-area-pb-md sm:px-6 sm:pb-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-foreground/84 transition-colors hover:bg-card/50 hover:text-foreground"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={onSave}
                            disabled={isSaving || !canSave}
                            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                            {isExistingNote ? "Save changes" : "Save note"}
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
    const [editingHighlight, setEditingHighlight] = useState<HighlightWithContent | null>(null);
    const [draftNote, setDraftNote] = useState("");
    const [draftColor, setDraftColor] = useState<HighlightColor>("yellow");
    const listContainerRef = useRef<HTMLDivElement | null>(null);
    const scrollFrameRef = useRef<number | null>(null);
    const deleteArmTimeoutRef = useRef<number | null>(null);
    const previousSearchParamsRef = useRef<string | null>(null);
    const shouldRespectInitialAskOpenRef = useRef(initialAskOpen);
    const deleteHighlight = useDeleteHighlight();
    const updateHighlight = useUpdateHighlight();
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
        if (!editingHighlight) {
            return;
        }

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [editingHighlight]);

    useEffect(() => {
        if (!editingHighlight) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !updateHighlight.isPending) {
                setEditingHighlight(null);
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [editingHighlight, updateHighlight.isPending]);

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

        const nextQuery = params.toString();
        const currentQuery = searchParams.toString();

        if (nextQuery !== currentQuery) {
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        }
    }, [
        debouncedSearchQuery,
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

    const mobileAskHref = useMemo(() => {
        const returnParams = new URLSearchParams(searchParams.toString());
        returnParams.delete("ask");
        const returnQuery = returnParams.toString();
        const returnTo = returnQuery ? `${pathname}?${returnQuery}` : pathname;

        const askParams = new URLSearchParams({
            scope: "notes",
            returnTo,
            notesScope: serializeNotesChatScope(notesChatScope),
        });

        return `/ask?${askParams.toString()}`;
    }, [notesChatScope, pathname, searchParams]);

    const hasDraftChanges = useMemo(() => {
        if (!editingHighlight) {
            return false;
        }

        const originalNote = editingHighlight.note_body?.trim() || "";
        const originalColor = normalizeHighlightColor(editingHighlight.color);
        return draftNote.trim() !== originalNote || draftColor !== originalColor;
    }, [draftColor, draftNote, editingHighlight]);

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

    const handleOpenEditor = (item: HighlightWithContent) => {
        setEditingHighlight(item);
        setDraftNote(item.note_body?.trim() || "");
        setDraftColor(normalizeHighlightColor(item.color));
    };

    const handleCloseEditor = () => {
        if (updateHighlight.isPending) {
            return;
        }

        setEditingHighlight(null);
    };

    const handleSaveEditor = async () => {
        if (!editingHighlight || !hasDraftChanges) {
            return;
        }

        const trimmedNote = draftNote.trim();
        const hadNote = Boolean(editingHighlight.note_body?.trim());

        try {
            await updateHighlight.mutateAsync({
                id: editingHighlight.id,
                note_body: trimmedNote === "" ? null : trimmedNote,
                color: draftColor,
            });

            if (!hadNote && trimmedNote.length > 0) {
                captureAnalyticsEvent("note_created", {
                    content_id: editingHighlight.content_item_id,
                    highlight_id: editingHighlight.id,
                    note_length: trimmedNote.length,
                    route: "/notes",
                    user_state: "authenticated",
                });
            }

            setEditingHighlight(null);

            if (trimmedNote === "") {
                toast.success(hadNote ? "Note removed" : "Highlight updated");
                return;
            }

            toast.success(hadNote ? "Note updated" : "Note added");
        } catch (error: any) {
            toast.error(error.message || "Failed to save note");
        }
    };

    const toggleAskPanel = () => {
        if (typeof window !== "undefined" && window.innerWidth < 1024) {
            router.push(mobileAskHref);
            return;
        }

        const nextAskOpen = !isAskOpen;
        const params = new URLSearchParams(searchParams.toString());

        if (nextAskOpen) {
            params.set("ask", "1");
        } else {
            params.delete("ask");
        }

        const nextQuery = params.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        setIsAskOpen(nextAskOpen);
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
                                "hidden items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors lg:inline-flex",
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
                                            placeholder="Search notes, highlights, sources, sections"
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

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={toggleAskPanel}
                                                aria-pressed={isAskOpen}
                                                className={cn(
                                                    "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 font-medium transition-colors",
                                                    isAskOpen
                                                        ? "border-primary/30 bg-primary/15 text-primary hover:bg-primary/20"
                                                        : "border-white/10 bg-card/35 text-foreground/85 hover:bg-card/50 hover:text-foreground"
                                                )}
                                            >
                                                {isAskOpen ? <X className="size-3.5" /> : <BotMessageSquare className="size-3.5" />}
                                                Ask
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setIsMobileFiltersExpanded((current) => !current)}
                                                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-card/35 px-3 py-1.5 font-medium text-foreground/85 transition-colors hover:bg-card/50 hover:text-foreground"
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
                                        placeholder="Search notes, highlights, sources, sections"
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
                                                onEdit={handleOpenEditor}
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
                                                onEdit={handleOpenEditor}
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

            <NoteEditorOverlay
                item={editingHighlight}
                draftNote={draftNote}
                draftColor={draftColor}
                canSave={hasDraftChanges}
                isSaving={updateHighlight.isPending}
                onClose={handleCloseEditor}
                onDraftNoteChange={setDraftNote}
                onDraftColorChange={setDraftColor}
                onClearDraft={() => setDraftNote("")}
                onSave={() => {
                    void handleSaveEditor();
                }}
            />
        </div>
    );
}
