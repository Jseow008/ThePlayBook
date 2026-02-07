"use client";

import Link from "next/link";
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
    Smile
} from "lucide-react";

/**
 * Browse Categories Page
 * 
 * Grid view of all content categories.
 */

const CATEGORIES = [
    { name: "Health", icon: Activity, color: "bg-red-500/10 text-red-500" },
    { name: "Fitness", icon: Dumbbell, color: "bg-orange-500/10 text-orange-500" },
    { name: "Wealth", icon: CircleDollarSign, color: "bg-green-500/10 text-green-500" },
    { name: "Finance", icon: Scale, color: "bg-emerald-500/10 text-emerald-500" },
    { name: "Productivity", icon: Briefcase, color: "bg-blue-500/10 text-blue-500" },
    { name: "Mindset", icon: Brain, color: "bg-indigo-500/10 text-indigo-500" },
    { name: "Relationships", icon: Heart, color: "bg-rose-500/10 text-rose-500" },
    { name: "Science", icon: Microscope, color: "bg-teal-500/10 text-teal-500" },
    { name: "Business", icon: Briefcase, color: "bg-slate-500/10 text-slate-500" },
    { name: "Philosophy", icon: Lightbulb, color: "bg-yellow-500/10 text-yellow-500" },
    { name: "Technology", icon: Laptop, color: "bg-cyan-500/10 text-cyan-500" },
    { name: "Lifestyle", icon: Smile, color: "bg-pink-500/10 text-pink-500" },
];

export default function CategoriesPage() {
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {CATEGORIES.map((category) => {
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
                                    Browse all content
                                </p>

                                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
