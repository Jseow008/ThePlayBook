"use client";

/**
 * ContentCard
 * 
 * Reusable card component for displaying content items in grids.
 */

import Link from "next/link";
import { BookOpen, Headphones, FileText } from "lucide-react";
import type { ContentItem } from "@/types/database";

interface ContentCardProps {
    item: ContentItem;
}

export function ContentCard({ item }: ContentCardProps) {
    const typeIcon = {
        podcast: Headphones,
        book: BookOpen,
        article: FileText,
    }[item.type];
    const Icon = typeIcon || BookOpen;

    return (
        <Link
            href={`/preview/${item.id}`}
            className="group relative aspect-[2/3] rounded-md overflow-hidden transition-transform duration-300 hover:scale-105 hover:z-10"
        >
            {/* Background */}
            {item.cover_image_url ? (
                <img
                    src={item.cover_image_url}
                    alt={item.title}
                    className="w-full h-full object-cover"
                />
            ) : (
                <div className="w-full h-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 flex items-center justify-center">
                    <Icon className="size-16 text-zinc-600" />
                </div>
            )}

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Bottom Info - Always visible */}
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
                    {item.type}
                </p>
                <h3 className="font-medium text-sm text-white line-clamp-2 group-hover:text-primary transition-colors">
                    {item.title}
                </h3>
            </div>

            {/* Hover Details */}
            <div className="absolute inset-x-0 top-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                {item.author && (
                    <p className="text-xs text-zinc-300 truncate">
                        {item.author}
                    </p>
                )}
            </div>

            {/* Border on hover */}
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-primary/50 rounded-md transition-colors" />
        </Link>
    );
}
