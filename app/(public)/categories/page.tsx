
import Link from "next/link";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
    Activity,
    ArrowLeft,
    Briefcase,
    Brain,
    CircleDollarSign,
    Dumbbell,
    Globe,
    Heart,
    Laptop,
    Lightbulb,
    Microscope,
    Scale,
    Smile,
    Tag,
    LayoutGrid
} from "lucide-react";

/**
 * Browse Categories Page
 * 
 * Bento Grid view of all content categories.
 * Fetches categories dynamically from database.
 */

// Mapping for curated categories (Style and Icon)
const CATEGORY_STYLES: Record<string, { icon: any, color: string }> = {
    "Mindset": { icon: Brain, color: "text-zinc-200 group-hover:text-white" },
    "Health": { icon: Activity, color: "text-zinc-200 group-hover:text-white" },
    "Wealth": { icon: CircleDollarSign, color: "text-zinc-200 group-hover:text-white" },
    "Business": { icon: Briefcase, color: "text-zinc-200 group-hover:text-white" },
    "Philosophy": { icon: Lightbulb, color: "text-zinc-200 group-hover:text-white" },
    "Fitness": { icon: Dumbbell, color: "text-zinc-200 group-hover:text-white" },
    "Finance": { icon: Scale, color: "text-zinc-200 group-hover:text-white" },
    "Productivity": { icon: Briefcase, color: "text-zinc-200 group-hover:text-white" },
    "Relationships": { icon: Heart, color: "text-zinc-200 group-hover:text-white" },
    "Science": { icon: Microscope, color: "text-zinc-200 group-hover:text-white" },
    "Technology": { icon: Laptop, color: "text-zinc-200 group-hover:text-white" },
    "Lifestyle": { icon: Smile, color: "text-zinc-200 group-hover:text-white" },
    "Travel": { icon: Globe, color: "text-zinc-200 group-hover:text-white" },
};

// Fallback colors for new categories
// Fallback colors for new categories
const FALLBACK_STYLE = "text-zinc-200 group-hover:text-white";

export default async function CategoriesPage() {
    const supabase = createPublicServerClient();

    // Aggregated stats via RPC
    // Aggregated stats via RPC
    const { data } = await supabase.rpc("get_category_stats");

    // Prepare list for rendering
    const categories = ((data as { category: string; count: number }[] | null) || [])
        .map((cat, index) => {
            const name = cat.category;
            const count = cat.count;

            // Uniform Grid Logic
            const span = "col-span-1";

            const style = CATEGORY_STYLES[name] || {
                icon: Tag,
                color: FALLBACK_STYLE,
            };

            return {
                name,
                count,
                span,
                ...style
            };
        });

    return (
        <div className="min-h-screen bg-background pb-20">
            <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
                {/* Back to Library */}
                <div className="mb-8">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground transition-all group"
                    >
                        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
                        <span>Back to Library</span>
                    </Link>
                </div>
                <h1 className="text-3xl font-bold text-foreground mb-2 font-display tracking-tight leading-tight">
                    Browse Categories
                </h1>
                <p className="text-zinc-400 mb-8">
                    Explore our curated library by topic
                </p>

                {/* Content */}
                {categories.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-[140px] gap-3">
                        {categories.map((category, index) => {
                            const Icon = category.icon;
                            return (
                                <Link
                                    key={category.name}
                                    href={`/search?category=${encodeURIComponent(category.name)}`}
                                    className={`
                                        group relative overflow-hidden rounded-xl border border-white/[0.08]
                                        bg-zinc-900/40 hover:bg-zinc-900/60 transition-colors duration-200
                                        flex flex-col justify-between p-5
                                        col-span-1
                                    `}
                                >
                                    {/* Header: Icon & Count */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={`p-2.5 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors duration-200 ${category.color}`}>
                                            <Icon className="size-5" />
                                        </div>

                                        {/* Counter Badge */}
                                        <span className="text-xs font-medium text-zinc-500 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                                            {category.count}
                                        </span>
                                    </div>

                                    {/* Footer: Title (Centered if simplifying) */}
                                    <div>
                                        <h3 className="text-lg font-semibold text-zinc-200 group-hover:text-white transition-colors">
                                            {category.name}
                                        </h3>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-20 animate-fade-in">
                        <div className="inline-flex items-center justify-center p-6 bg-zinc-800/30 rounded-full mb-6 border border-zinc-800 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-zinc-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <LayoutGrid className="size-10 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            No categories found
                        </h2>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                            There is no content available yet. Add some content to see categories here.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
