
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
    Activity,
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
    "Mindset": {
        icon: Brain,
        color: "text-indigo-500 from-indigo-500/20 to-purple-500/20 border-indigo-500/30",
    },
    "Health": {
        icon: Activity,
        color: "text-red-500 from-red-500/20 to-rose-500/20 border-red-500/30",
    },
    "Wealth": {
        icon: CircleDollarSign,
        color: "text-emerald-500 from-emerald-500/20 to-green-500/20 border-emerald-500/30",
    },
    "Business": {
        icon: Briefcase,
        color: "text-blue-500 from-blue-500/20 to-sky-500/20 border-blue-500/30",
    },
    "Philosophy": {
        icon: Lightbulb,
        color: "text-amber-500 from-amber-500/20 to-yellow-500/20 border-amber-500/30",
    },
    "Fitness": { icon: Dumbbell, color: "text-orange-500 from-orange-500/20 to-red-500/20 border-orange-500/30" },
    "Finance": { icon: Scale, color: "text-teal-500 from-teal-500/20 to-emerald-500/20 border-teal-500/30" },
    "Productivity": { icon: Briefcase, color: "text-cyan-500 from-cyan-500/20 to-blue-500/20 border-cyan-500/30" },
    "Relationships": { icon: Heart, color: "text-rose-500 from-rose-500/20 to-pink-500/20 border-rose-500/30" },
    "Science": { icon: Microscope, color: "text-violet-500 from-violet-500/20 to-indigo-500/20 border-violet-500/30" },
    "Technology": { icon: Laptop, color: "text-sky-500 from-sky-500/20 to-cyan-500/20 border-sky-500/30" },
    "Lifestyle": { icon: Smile, color: "text-pink-500 from-pink-500/20 to-rose-500/20 border-pink-500/30" },
    "Travel": { icon: Globe, color: "text-lime-500 from-lime-500/20 to-green-500/20 border-lime-500/30" },
};

// Fallback colors for new categories
const FALLBACK_STYLES = [
    "text-slate-500 from-slate-500/20 to-gray-500/20 border-slate-500/30",
    "text-zinc-500 from-zinc-500/20 to-stone-500/20 border-zinc-500/30",
];

export default async function CategoriesPage() {
    const supabase = await createClient();

    // Fetch all non-null categories
    const { data } = await supabase
        .from("content_item")
        .select("category")
        .not("category", "is", null);

    // Count categories
    const categoryCounts: Record<string, number> = {};
    if (data) {
        (data as any[]).forEach(item => {
            if (item.category) {
                const cat = item.category.trim();
                categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            }
        });
    }

    // Prepare list for rendering
    const categories = Object.keys(categoryCounts)
        .sort((a, b) => categoryCounts[b] - categoryCounts[a]) // Soft by popularity
        .map((name, index) => {
            const count = categoryCounts[name];
            let span = "col-span-1 row-span-1";

            // Dynamic Sizing Logic
            if (count >= 10 || index === 0) {
                // Verified "Star" categories (or the top 1 if none > 10)
                span = "md:col-span-2 md:row-span-2";
            } else if (count >= 5 || index <= 2) {
                // "Major" categories (or top 3)
                span = "md:col-span-2";
            }

            const style = CATEGORY_STYLES[name] || {
                icon: Tag,
                color: FALLBACK_STYLES[index % FALLBACK_STYLES.length],
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
            {/* Header */}
            <div className="pt-8 pb-6 px-6 lg:px-12">
                <h1 className="text-3xl font-bold text-foreground mb-2">
                    Browse Categories
                </h1>
                <p className="text-muted-foreground">
                    Explore our curated library by topic
                </p>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-20">
                {categories.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[180px] gap-4 grid-flow-dense">
                        {categories.map((category, index) => {
                            const Icon = category.icon;
                            // Stagger animation delay
                            const animationDelay = `${index * 50}ms`;

                            return (
                                <Link
                                    key={category.name}
                                    href={`/search?category=${encodeURIComponent(category.name)}`}
                                    className={`
                                        group relative overflow-hidden rounded-3xl border border-white/5 
                                        bg-zinc-900/40 backdrop-blur-xl transition-all duration-500
                                        hover:scale-[1.02] hover:border-white/10 hover:shadow-2xl hover:shadow-black/50
                                        animate-fade-in opacity-0
                                        flex flex-col justify-between p-6
                                        ${category.span || "col-span-1 row-span-1"}
                                    `}
                                    style={{ animationDelay }}
                                >
                                    {/* Ambient Glow Background */}
                                    <div className={`absolute inset-0 bg-gradient-to-br ${category.color.split(" ")[1]} ${category.color.split(" ")[2]} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                                    {/* Subtle permanent tint */}
                                    <div className={`absolute inset-0 bg-gradient-to-br ${category.color.split(" ")[1]} ${category.color.split(" ")[2]} opacity-[0.03] group-hover:opacity-0 transition-opacity duration-500`} />

                                    {/* Content */}
                                    <div className="relative z-10 flex items-start justify-between">
                                        <div className={`p-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md group-hover:scale-110 transition-transform duration-500 ${category.color.split(" ")[0]} ${category.color.split(" ")[3]}`}>
                                            <Icon className="size-6" />
                                        </div>

                                        {/* Counter Badge */}
                                        <span className="text-xs font-medium text-zinc-500 bg-zinc-900/50 px-2 py-1 rounded-full border border-zinc-800/50 group-hover:text-zinc-300 group-hover:border-zinc-700 transition-colors">
                                            {category.count}
                                        </span>
                                    </div>

                                    <div className="relative z-10 mt-auto">
                                        <h3 className="text-xl font-bold text-zinc-100 group-hover:text-white transition-colors">
                                            {category.name}
                                        </h3>
                                        <p className="text-xs text-zinc-500 mt-1 group-hover:text-zinc-400 transition-colors flex items-center gap-1">
                                            Explore collection
                                            <svg className="w-3 h-3 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </p>
                                    </div>

                                    {/* Decorative shine effect */}
                                    <div className="absolute -top-full -left-full w-[200%] h-[200%] bg-gradient-to-br from-transparent via-white/5 to-transparent rotate-45 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />
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
