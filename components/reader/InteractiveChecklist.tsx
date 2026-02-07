"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { ChecklistPayload } from "@/types/domain";

/**
 * Interactive Checklist
 * 
 * Artifact component for checklist-type content.
 * Supports optimistic updates with background sync.
 */

interface InteractiveChecklistProps {
    artifactId: string;
    payload: ChecklistPayload;
    progress: Record<string, boolean>;
    onToggle: (itemId: string, checked: boolean) => void;
    isLoading?: boolean;
}

export function InteractiveChecklist({
    artifactId,
    payload,
    progress,
    onToggle,
    isLoading = false,
}: InteractiveChecklistProps) {
    const completedCount = Object.values(progress).filter(Boolean).length;
    const totalCount = payload.items.length;
    const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return (
        <div className="border border-border rounded-lg bg-card/40 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-border bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-foreground">{payload.title}</h3>
                    <span className="text-sm text-muted-foreground">
                        {completedCount}/{totalCount} completed
                    </span>
                </div>

                {/* Progress Bar */}
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            {/* Items */}
            <div className="divide-y divide-border/50">
                {payload.items.map((item) => {
                    const isChecked = progress[item.id] ?? false;

                    return (
                        <ChecklistItem
                            key={item.id}
                            label={item.label}
                            mandatory={item.mandatory}
                            checked={isChecked}
                            disabled={isLoading}
                            onToggle={(checked) => onToggle(item.id, checked)}
                        />
                    );
                })}
            </div>
        </div>
    );
}

interface ChecklistItemProps {
    label: string;
    mandatory?: boolean;
    checked: boolean;
    disabled?: boolean;
    onToggle: (checked: boolean) => void;
}

function ChecklistItem({
    label,
    mandatory,
    checked,
    disabled,
    onToggle,
}: ChecklistItemProps) {
    const [isOptimistic, setIsOptimistic] = useState(false);

    const handleClick = () => {
        if (disabled) return;

        // Optimistic update
        setIsOptimistic(true);
        onToggle(!checked);

        // Reset optimistic state after a short delay
        setTimeout(() => setIsOptimistic(false), 500);
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled}
            className={cn(
                "w-full flex items-start gap-3 p-4 text-left transition-colors",
                "hover:bg-accent/20",
                disabled && "opacity-50 cursor-not-allowed"
            )}
        >
            {/* Checkbox */}
            <div
                className={cn(
                    "flex-shrink-0 w-5 h-5 rounded border transition-all mt-0.5",
                    checked
                        ? "bg-primary border-primary"
                        : "border-input bg-background",
                    isOptimistic && "scale-95"
                )}
            >
                {checked && (
                    <Check className="size-5 text-primary-foreground p-0.5" />
                )}
            </div>

            {/* Label */}
            <span
                className={cn(
                    "flex-1 text-sm transition-colors",
                    checked
                        ? "line-through text-muted-foreground"
                        : "text-foreground"
                )}
            >
                {label}
                {mandatory && (
                    <span className="ml-1 text-destructive text-xs">*</span>
                )}
            </span>
        </button>
    );
}
