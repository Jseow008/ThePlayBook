import { PublicLayoutShell } from "@/components/ui/PublicLayoutShell";
import { createClient } from "@/lib/supabase/server";

/**
 * Public Layout
 * 
 * Wraps all public routes. The PublicLayoutShell client component
 * conditionally renders sidebar/nav chrome based on the current route.
 * Landing page (/) gets standalone layout, everything else gets full chrome.
 */

export default async function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    return <PublicLayoutShell initialUser={user}>{children}</PublicLayoutShell>;
}
