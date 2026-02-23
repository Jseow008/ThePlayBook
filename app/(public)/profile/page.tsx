import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileHeader } from "@/components/ui/ProfileHeader";
import { ReadingHeatmap } from "@/components/ui/ReadingHeatmap";
import { RecentActivity } from "@/components/ui/RecentActivity";
import { ArrowLeft, History } from "lucide-react";
import Link from "next/link";

export default async function ProfilePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
                {/* Back to Library */}
                <div className="mb-8">
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground transition-all group"
                    >
                        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
                        <span>Back to Library</span>
                    </Link>
                </div>

                <main className="space-y-6">
                    {/* 1. Profile Identity Header */}
                    <section>
                        <ProfileHeader user={user} />
                    </section>

                    {/* 2. Reading Momentum Heatmap */}
                    <section>
                        <ReadingHeatmap />
                    </section>

                    {/* 3. Recent Activity */}
                    <section>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <History className="w-5 h-5 text-muted-foreground" />
                                Jump Back In
                            </h2>
                            <Link
                                href="/library/reading"
                                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                                View All History
                            </Link>
                        </div>
                        <RecentActivity />
                    </section>
                </main>
            </div>
        </div>
    );
}
