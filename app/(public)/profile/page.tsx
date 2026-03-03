import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileHeader } from "@/components/ui/ProfileHeader";
import { ReadingHeatmap } from "@/components/ui/ReadingHeatmap";
import { RecentActivity } from "@/components/ui/RecentActivity";
import { History } from "lucide-react";
import Link from "next/link";

export default async function ProfilePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <div className="min-h-screen bg-background text-foreground pb-8 lg:pb-24">
            <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">

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
