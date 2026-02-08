
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
 * Grid view of all content categories.
 * Fetches categories dynamically from database.
 */

// Mapping for curated categories (Style and Icon)
const CATEGORY_STYLES: Record<string, { icon: any, color: string }> = {
    "Health": { icon: Activity, color: "bg-red-500/10 text-red-500" },
    "Fitness": { icon: Dumbbell, color: "bg-orange-500/10 text-orange-500" },
    "Wealth": { icon: CircleDollarSign, color: "bg-green-500/10 text-green-500" },
    "Finance": { icon: Scale, color: "bg-emerald-500/10 text-emerald-500" },
    "Productivity": { icon: Briefcase, color: "bg-blue-500/10 text-blue-500" },
    "Mindset": { icon: Brain, color: "bg-indigo-500/10 text-indigo-500" },
    "Relationships": { icon: Heart, color: "bg-rose-500/10 text-rose-500" },
    "Science": { icon: Microscope, color: "bg-teal-500/10 text-teal-500" },
    "Business": { icon: Briefcase, color: "bg-slate-500/10 text-slate-500" },
    "Philosophy": { icon: Lightbulb, color: "bg-yellow-500/10 text-yellow-500" },
    "Technology": { icon: Laptop, color: "bg-cyan-500/10 text-cyan-500" },
    "Lifestyle": { icon: Smile, color: "bg-pink-500/10 text-pink-500" },
    "Travel": { icon: Globe, color: "bg-sky-500/10 text-sky-500" },
};

// Fallback colors for new categories
const FALLBACK_COLORS = [
    "bg-red-500/10 text-red-500",
    "bg-orange-500/10 text-orange-500",
    "bg-green-500/10 text-green-500",
    "bg-emerald-500/10 text-emerald-500",
    "bg-blue-500/10 text-blue-500",
    "bg-indigo-500/10 text-indigo-500",
    "bg-rose-500/10 text-rose-500",
    "bg-teal-500/10 text-teal-500",
    "bg-slate-500/10 text-slate-500",
    "bg-yellow-500/10 text-yellow-500",
    "bg-cyan-500/10 text-cyan-500",
    "bg-pink-500/10 text-pink-500",
    "bg-purple-500/10 text-purple-500",
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
        data.forEach(item => {
            if (item.category) {
                // Determine if category string contains multiple (e.g. "Health, Fitness")?
                // Assuming single category per item for now based on current schema usage.
                const cat = item.category.trim();
                categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            }
        });
    }

    // Prepare list for rendering
    const categories = Object.keys(categoryCounts).sort().map((name, index) => {
        const style = CATEGORY_STYLES[name] || {
            icon: Tag,
            color: FALLBACK_COLORS[index % FALLBACK_COLORS.length]
        };

        return {
            name,
            count: categoryCounts[name],
            ...style
        };
    });

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Header */}
            <div className="border-b border-zinc-800/50 bg-background/80 backdrop-blur-md sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-6 lg:px-16 py-6">
                    <h1 className="text-2xl font-bold text-foreground">Browse Categories</h1>
                    <p className="text-sm text-muted-foreground">
                        Explore our curated library by topic
                    </p>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 lg:px-16 py-8">
                {categories.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {categories.map((category) => {
                            const Icon = category.icon;
                            return (
                                <Link
                                    key={category.name}
                                    href={`/search?category=${encodeURIComponent(category.name)}`}
                                    className="group relative overflow-hidden bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:bg-zinc-800/50 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-black/20 hover:border-zinc-700"
                                >
                                    <div className={`inline-flex items-center justify-center p-3 rounded-lg mb-4 ${category.color} transition-colors`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                                        {category.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {category.count} {category.count === 1 ? 'item' : 'items'}
                                    </p>

                                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <div className="inline-flex items-center justify-center p-6 bg-zinc-800/30 rounded-full mb-6 border border-zinc-800">
                            <LayoutGrid className="size-10 text-muted-foreground" />
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
