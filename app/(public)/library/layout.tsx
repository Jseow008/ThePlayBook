import { LibrarySearchShell } from "@/components/ui/LibrarySearchShell";

export default function LibraryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <LibrarySearchShell>{children}</LibrarySearchShell>;
}
