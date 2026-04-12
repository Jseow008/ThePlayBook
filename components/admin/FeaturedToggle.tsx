"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toggleFeaturedStatus } from "@/app/admin/actions";

interface FeaturedToggleProps {
    contentId: string;
    isFeatured: boolean;
    title: string;
}

export function FeaturedToggle({ contentId, isFeatured, title }: FeaturedToggleProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const toggleFeatured = async () => {
        setIsLoading(true);
        try {
            const result = await toggleFeaturedStatus(contentId, isFeatured);

            if (!result.success) {
                toast.error(`Failed to update ${title}: ${result.error}`);
                return;
            }
            toast.success(isFeatured ? `Removed "${title}" from featured` : `Featured "${title}"`);
            router.refresh();
        } catch (error) {
            console.error("Error toggling featured status:", error);
            toast.error(`Failed to update ${title}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={toggleFeatured}
            disabled={isLoading}
            className={`p-2 rounded-lg transition-colors ${isFeatured
                    ? "text-yellow-500 hover:bg-yellow-50"
                    : "text-zinc-300 hover:text-zinc-400 hover:bg-zinc-50"
                }`}
            title={isFeatured ? "Remove from Hero Carousel" : "Add to Hero Carousel"}
        >
            {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
                <Star className={`w-5 h-5 ${isFeatured ? "fill-current" : ""}`} />
            )}
        </button>
    );
}
