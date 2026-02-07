"use client";

/**
 * Interactive Checklist Display Component
 * 
 * Renders an interactive checklist for users in the reader view.
 * Styled to match the Actions panel for consistent UX.
 */

import { useState, useEffect } from "react";
import { CheckSquare, Square } from "lucide-react";

interface ChecklistItem {
    id: string;
    label: string;
    mandatory: boolean;
}

interface ChecklistPayload {
    title: string;
    items: ChecklistItem[];
}

interface ChecklistDisplayProps {
    contentId: string;
    checklists: Array<{
        id: string;
        type: "checklist";
        payload_schema: ChecklistPayload;
    }>;
}

export function ChecklistDisplay({ contentId, checklists }: ChecklistDisplayProps) {
    const [completedItems, setCompletedItems] = useState<Record<string, Set<string>>>({});

    // Load saved progress from localStorage
    useEffect(() => {
        const saved = localStorage.getItem(`lifebook_checklists_${contentId}`);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const restored: Record<string, Set<string>> = {};
                for (const [key, items] of Object.entries(parsed)) {
                    restored[key] = new Set(items as string[]);
                }
                setCompletedItems(restored);
            } catch (e) {
                console.error("Failed to parse checklist progress", e);
            }
        }
    }, [contentId]);

    // Save progress to localStorage
    useEffect(() => {
        const toSave: Record<string, string[]> = {};
        for (const [key, items] of Object.entries(completedItems)) {
            toSave[key] = Array.from(items);
        }
        localStorage.setItem(`lifebook_checklists_${contentId}`, JSON.stringify(toSave));
    }, [completedItems, contentId]);

    const toggleItem = (checklistId: string, itemId: string) => {
        setCompletedItems(prev => {
            const checklistItems = prev[checklistId] || new Set();
            const newSet = new Set(checklistItems);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return { ...prev, [checklistId]: newSet };
        });
    };

    const getProgress = (checklist: { id: string; payload_schema: ChecklistPayload }) => {
        const items = completedItems[checklist.id] || new Set();
        const total = checklist.payload_schema.items.length;
        const completed = items.size;
        return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
    };

    if (checklists.length === 0) {
        return null;
    }



    return (
        <div className="space-y-4">
            {checklists.map((checklist) => {
                const progress = getProgress(checklist);

                return (
                    <div key={checklist.id} className="p-4 rounded-lg bg-card border shadow-sm space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                {checklist.payload_schema.title || "Action Items"}
                            </h3>
                            <span className="text-xs text-muted-foreground">
                                {progress.completed}/{progress.total}
                            </span>
                        </div>

                        {/* Checklist Items */}
                        {checklist.payload_schema.items.map(item => {
                            const isChecked = (completedItems[checklist.id] || new Set()).has(item.id);
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => toggleItem(checklist.id, item.id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-md transition-colors text-sm text-left ${isChecked
                                        ? "bg-primary/10 text-muted-foreground"
                                        : "bg-secondary/50 text-foreground hover:bg-secondary"
                                        }`}
                                >
                                    {isChecked ? (
                                        <CheckSquare className="size-4 text-primary flex-shrink-0" />
                                    ) : (
                                        <Square className="size-4 flex-shrink-0" />
                                    )}
                                    <span className={isChecked ? "line-through" : ""}>
                                        {item.label}
                                    </span>
                                </button>
                            );
                        })}

                        {/* Progress bar */}
                        <div className="pt-2">
                            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${progress.percentage}%` }}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
