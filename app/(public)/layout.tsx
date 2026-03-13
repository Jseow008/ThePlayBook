import { PublicLayoutShell } from "@/components/ui/PublicLayoutShell";
import { AuthUserProvider } from "@/hooks/useAuthUser";
import { ReadingProgressProvider } from "@/hooks/useReadingProgress";

/**
 * Public Layout
 * 
 * Wraps all public routes. The PublicLayoutShell client component
 * conditionally renders sidebar/nav chrome based on the current route.
 * Landing page (/) gets standalone layout, everything else gets full chrome.
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
