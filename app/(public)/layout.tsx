import { PublicLayoutShell } from "@/components/ui/PublicLayoutShell";
import { AuthUserProvider } from "@/hooks/useAuthUser";
import { ReadingProgressProvider } from "@/hooks/useReadingProgress";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
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
    const { user } = resolveAuthUserResult(await supabase.auth.getUser());

    return (
        <AuthUserProvider initialUser={user}>
            <ReadingProgressProvider initialUser={user}>
                <PublicLayoutShell>{children}</PublicLayoutShell>
            </ReadingProgressProvider>
        </AuthUserProvider>
    );
}
