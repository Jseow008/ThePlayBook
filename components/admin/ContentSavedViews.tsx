"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookmarkPlus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
    type AdminContentViewState,
    getAdminContentViewStateFromSearchParams,
} from "@/lib/admin-content-query";
import { applyAdminContentViewStateToParams } from "@/lib/admin-content-permanent-filters";

const STORAGE_KEY = "admin_content_saved_views_v1";

type SavedView = {
    id: string;
    name: string;
    state: AdminContentViewState;
};

function readSavedViews() {
    if (typeof window === "undefined") {
        return [] as SavedView[];
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((view): view is SavedView => {
            return Boolean(
                view
                && typeof view === "object"
                && typeof view.id === "string"
                && typeof view.name === "string"
                && view.state
                && typeof view.state === "object"
            );
        });
    } catch {
        return [];
    }
}

function writeSavedViews(views: SavedView[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

function isSameViewState(left: AdminContentViewState, right: AdminContentViewState) {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function ContentSavedViews({
    basePath = "/admin/content",
}: {
    basePath?: string;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [savedViews, setSavedViews] = useState<SavedView[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [draftName, setDraftName] = useState("");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setSavedViews(readSavedViews());
    }, []);

    const currentState = useMemo(() => getAdminContentViewStateFromSearchParams({
        status: searchParams.get("status"),
        type: searchParams.get("type"),
        featured: searchParams.get("featured"),
        sort: searchParams.get("sort"),
        ai: searchParams.get("ai"),
        voice: searchParams.get("voice"),
        page_size: searchParams.get("page_size"),
    }), [searchParams]);

    const selectedViewId = savedViews.find((view) => isSameViewState(view.state, currentState))?.id ?? "";

    const applySavedView = (viewId: string) => {
        const selectedView = savedViews.find((view) => view.id === viewId);
        if (!selectedView) {
            return;
        }

        const params = new URLSearchParams(searchParams.toString());
        params.delete("q");
        applyAdminContentViewStateToParams(params, selectedView.state);
        startTransition(() => {
            router.push(`${basePath}?${params.toString()}`);
        });
    };

    const saveCurrentView = () => {
        const name = draftName.trim();
        if (!name) {
            toast.error("Name the saved view first.");
            return;
        }

        const nextViews = [
            ...savedViews.filter((view) => view.name.toLowerCase() !== name.toLowerCase()),
            {
                id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
                name,
                state: currentState,
            },
        ].sort((left, right) => left.name.localeCompare(right.name));

        setSavedViews(nextViews);
        writeSavedViews(nextViews);
        setDraftName("");
        setIsCreating(false);
        toast.success(`Saved view "${name}"`);
    };

    const deleteSelectedView = () => {
        if (!selectedViewId) {
            return;
        }

        const selectedView = savedViews.find((view) => view.id === selectedViewId);
        const nextViews = savedViews.filter((view) => view.id !== selectedViewId);
        setSavedViews(nextViews);
        writeSavedViews(nextViews);
        toast.success(`Deleted view "${selectedView?.name ?? "Saved view"}"`);
    };

    return (
        <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Saved Views
            </span>

            {savedViews.length > 0 ? (
                <select
                    value={selectedViewId}
                    onChange={(event) => applySavedView(event.target.value)}
                    disabled={isPending}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    <option value="">Open saved view...</option>
                    {savedViews.map((view) => (
                        <option key={view.id} value={view.id}>
                            {view.name}
                        </option>
                    ))}
                </select>
            ) : (
                <span className="text-sm text-muted-foreground">No saved views yet.</span>
            )}

            {isCreating ? (
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="text"
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        placeholder="Draft books"
                        className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                        type="button"
                        onClick={saveCurrentView}
                        disabled={isPending}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                        <Save className="size-4" />
                        Save
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setDraftName("");
                            setIsCreating(false);
                        }}
                        disabled={isPending}
                        className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                    <BookmarkPlus className="size-4" />
                    Save current view
                </button>
            )}

            {selectedViewId && !isCreating && (
                <button
                    type="button"
                    onClick={deleteSelectedView}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <Trash2 className="size-4" />
                    Delete view
                </button>
            )}
        </div>
    );
}
