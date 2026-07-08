"use client";

import { toast } from "sonner";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { LibrarySaveButton, type LibrarySaveButtonProps } from "@/components/ui/LibrarySaveButton";

interface SaveToLibraryButtonProps
    extends Omit<LibrarySaveButtonProps, "isSaved" | "isLoading" | "onToggle"> {
    contentId: string;
}

export function SaveToLibraryButton({
    contentId,
    ...buttonProps
}: SaveToLibraryButtonProps) {
    const { isInMyList, toggleMyList, isLoaded: isReadingProgressLoaded } = useReadingProgress();
    const isSaved = isReadingProgressLoaded && isInMyList(contentId);

    return (
        <LibrarySaveButton
            {...buttonProps}
            isSaved={isSaved}
            isLoading={!isReadingProgressLoaded}
            onToggle={() => {
                const wasSaved = isInMyList(contentId);
                toggleMyList(contentId);
                toast.success(wasSaved ? "Removed from Library" : "Saved to Library");
            }}
        />
    );
}
