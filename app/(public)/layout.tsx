import { PublicLayoutShell } from "@/components/ui/PublicLayoutShell";

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
    return <PublicLayoutShell>{children}</PublicLayoutShell>;
}
