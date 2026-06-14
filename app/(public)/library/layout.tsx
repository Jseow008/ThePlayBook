import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LibraryNav } from "@/components/ui/LibraryNav";

export default function LibraryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col min-h-screen">
            <div className="mx-auto w-full max-w-7xl px-6 pt-4 lg:px-16 lg:pt-8">
                <Link
                    href="/browse"
                    className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Back to Browse
                </Link>
            </div>
            <LibraryNav />
            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}
