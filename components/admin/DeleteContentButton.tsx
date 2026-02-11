"use client";

/**
 * Delete Content Button
 * 
 * Client component for handling content deletion with confirmation.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, X } from "lucide-react";

interface DeleteContentButtonProps {
    contentId: string;
    contentTitle: string;
}

export function DeleteContentButton({ contentId, contentTitle }: DeleteContentButtonProps) {
    const router = useRouter();
    const [showConfirm, setShowConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);

        try {
            const response = await fetch(`/api/admin/content/${contentId}`, {
                method: "DELETE",
            });

            if (response.ok) {
                router.refresh();
            } else {
                console.error("Failed to delete content");
            }
        } catch (error) {
            console.error("Delete error:", error);
        } finally {
            setIsDeleting(false);
            setShowConfirm(false);
        }
    };

    if (showConfirm) {
        return (
            <div className="flex items-center gap-1">
                <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50"
                >
                    {isDeleting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                        "Delete"
                    )}
                </button>
                <button
                    onClick={() => setShowConfirm(false)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 rounded transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={() => setShowConfirm(true)}
            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title={`Delete ${contentTitle}`}
        >
            <Trash2 className="w-4 h-4" />
        </button>
    );
}
