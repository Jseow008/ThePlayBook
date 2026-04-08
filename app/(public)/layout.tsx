import { PublicLayoutShell } from "@/components/ui/PublicLayoutShell";
import { AuthUserProvider } from "@/hooks/useAuthUser";
import { ReadingProgressProvider } from "@/hooks/useReadingProgress";

/**
 * Public Layout
 * 
 * Shared layout for public-facing routes.
 * Auth state is resolved on the client so cacheable pages can keep
 * their static/ISR behavior instead of becoming request-time dynamic.
 */

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AuthUserProvider>
            <ReadingProgressProvider>
                <PublicLayoutShell>{children}</PublicLayoutShell>
            </ReadingProgressProvider>
        </AuthUserProvider>
    );
}
