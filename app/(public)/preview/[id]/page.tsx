import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, User, CheckSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { QuickMode } from "@/types/domain";
import type { ContentItem } from "@/types/database";

/**
 * Preview Page
 * 
 * Public preview of a content item showing Quick Mode content.
 * Requires authentication to access full reader.
 */

export const revalidate = 3600; // Revalidate every hour

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function PreviewPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = await createClient();

    // Fetch the content item
    const { data, error } = await supabase
        .from("content_item")
        .select("*")
        .eq("id", id)
        .eq("status", "verified")
        .is("deleted_at", null)
        .single();

    if (error || !data) {
        notFound();
    }

    const item = data as ContentItem;

    // Get segment count
    const { count: segmentCount } = await supabase
        .from("segment")
        .select("*", { count: "exact", head: true })
        .eq("item_id", id)
        .is("deleted_at", null);

    // Get artifact count
    const { count: artifactCount } = await supabase
        .from("artifact")
        .select("*", { count: "exact", head: true })
        .eq("item_id", id);

    const quickMode = item.quick_mode_json as QuickMode | null;

    return (
        <div className="min-h-screen">
            {/* Header */}
            <div className="border-b border-border bg-card/50">
                <div className="container mx-auto px-4 py-4">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors px-3 py-2 rounded-md hover:bg-zinc-800/50"
                    >
                        <ArrowLeft className="size-4" />
                        Back to Home
                    </Link>
                </div>
            </div>

            {/* Content */}
            <div className="container mx-auto px-4 py-8 max-w-3xl">
                {/* Cover Image */}
                {item.cover_image_url && (
                    <div className="relative w-full aspect-video md:aspect-[21/9] rounded-xl overflow-hidden mb-8 shadow-lg border border-white/10">
                        <img
                            src={item.cover_image_url}
                            alt={item.title}
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    </div>
                )}

                {/* Meta */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                    <span className="uppercase tracking-wider">{item.type}</span>
                    {item.duration_seconds && (
                        <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Clock className="size-4" />
                                {Math.round(item.duration_seconds / 60)} min
                            </span>
                        </>
                    )}
                    {segmentCount !== null && segmentCount > 0 && (
                        <>
                            <span>•</span>
                            <span>{segmentCount} sections</span>
                        </>
                    )}
                </div>

                {/* Title */}
                <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-4">
                    {item.title}
                </h1>

                {/* Author */}
                {item.author && (
                    <div className="flex items-center gap-2 text-muted-foreground mb-8">
                        <User className="size-4" />
                        <span>{item.author}</span>
                    </div>
                )}

                {/* Quick Mode Content */}
                {quickMode && (
                    <div className="space-y-8">
                        {/* Hook */}
                        <div className="border-l-4 border-primary pl-4">
                            <p className="text-lg text-foreground italic">{quickMode.hook}</p>
                        </div>

                        {/* Big Idea */}
                        <div>
                            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                The Big Idea
                            </h2>
                            <p className="text-foreground leading-relaxed">
                                {quickMode.big_idea}
                            </p>
                        </div>

                        {/* Key Takeaways */}
                        <div>
                            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                Key Takeaways
                            </h2>
                            <ul className="space-y-3">
                                {quickMode.key_takeaways.map((takeaway, index) => (
                                    <li key={index} className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent flex items-center justify-center text-xs font-medium">
                                            {index + 1}
                                        </span>
                                        <span className="text-foreground pt-0.5">{takeaway}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* Artifacts Preview */}
                {artifactCount && artifactCount > 0 && (
                    <div className="mt-8 p-4 rounded-lg border border-border bg-card/50">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CheckSquare className="size-4" />
                            <span>
                                This content includes {artifactCount} interactive{" "}
                                {artifactCount === 1 ? "checklist" : "checklists"}
                            </span>
                        </div>
                    </div>
                )}

                {/* CTA */}
                {/* CTA */}
                <div className="mt-12 text-center">
                    <Link
                        href={`/read/${id}`}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors btn-active"
                    >
                        Start Reading
                    </Link>
                </div>
            </div>
        </div>
    );
}
