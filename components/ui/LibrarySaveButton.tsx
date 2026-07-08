"use client";

import type { MouseEvent } from "react";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LibrarySaveButtonProps {
    contentTitle: string;
    isSaved: boolean;
    onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
    isLoading?: boolean;
    className?: string;
    loadingClassName?: string;
    savedClassName?: string;
    unsavedClassName?: string;
    iconClassName?: string;
    savedIconClassName?: string;
    unsavedIconClassName?: string;
    /** Use only when the button sits inside a clickable ancestor, such as a linked card. */
    stopPropagation?: boolean;
    loadingLabel?: string;
}

export function LibrarySaveButton({
    contentTitle,
    isSaved,
    onToggle,
    isLoading = false,
    className,
    loadingClassName,
    savedClassName,
    unsavedClassName,
    iconClassName,
    savedIconClassName,
    unsavedIconClassName,
    stopPropagation = false,
    loadingLabel = "Loading Library state",
}: LibrarySaveButtonProps) {
    const actionTitle = isSaved ? "Remove from Library" : "Save to Library";
    const ariaLabel = isLoading
        ? loadingLabel
        : isSaved
            ? `Remove ${contentTitle} from Library`
            : `Save ${contentTitle} to Library`;

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (stopPropagation) {
            event.preventDefault();
            event.stopPropagation();
        }

        onToggle(event);
    };

    return (
        <button
            type="button"
            disabled={isLoading}
            onClick={handleClick}
            className={cn(
                className,
                isLoading ? loadingClassName : isSaved ? savedClassName : unsavedClassName
            )}
            title={isLoading ? loadingLabel : actionTitle}
            aria-label={ariaLabel}
        >
            <Bookmark
                className={cn(
                    iconClassName,
                    isSaved ? savedIconClassName : unsavedIconClassName
                )}
                fill={isSaved ? "currentColor" : "none"}
            />
        </button>
    );
}
