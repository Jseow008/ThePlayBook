"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import type { SegmentSummary } from "@/types/domain";

/**
 * Segment Navigation
 * 
 * Sidebar component showing segment list with active state.
 */

interface SegmentNavProps {
    segments: SegmentSummary[];
    currentSegmentId: string | null;
    completedSegments?: Set<string>;
    onSegmentClick: (segmentId: string) => void;
}

export function SegmentNav({
    segments,
    currentSegmentId,
    completedSegments = new Set(),
    onSegmentClick,
}: SegmentNavProps) {
    return (
        <nav className="space-y-1">
            {segments.map((segment, index) => {
                const isActive = segment.id === currentSegmentId;
                const isCompleted = completedSegments.has(segment.id);

                return (
                    <button
                        key={segment.id}
                        onClick={() => onSegmentClick(segment.id)}
                        className={cn(
                            "w-full flex items-center gap-3 p-3 text-sm rounded-md transition-colors text-left",
                            isActive
                                ? "bg-accent text-foreground font-medium border-l-2 border-primary"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                    >
                        {/* Number or Check */}
                        <span
                            className={cn(
                                "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs",
                                isCompleted
                                    ? "bg-green-500/20 text-green-400"
                                    : isActive
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground"
                            )}
                        >
                            {isCompleted ? (
                                <CheckCircle2 className="size-4" />
                            ) : (
                                index + 1
                            )}
                        </span>

                        {/* Title */}
                        <span className="truncate">
                            {segment.title || `Section ${index + 1}`}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}
