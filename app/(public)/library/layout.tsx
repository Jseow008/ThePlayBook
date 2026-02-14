import { LibraryNav } from "@/components/ui/LibraryNav";

export default function LibraryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col min-h-screen">
            <LibraryNav />
            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}
