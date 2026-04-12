"use client";

export function ContentStatusBadge({
    status,
    deleted = false,
}: {
    status: string;
    deleted?: boolean;
}) {
    if (deleted) {
        return (
            <span className="inline-flex items-center rounded-full border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                Deleted
            </span>
        );
    }

    if (status === "verified") {
        return (
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                Published
            </span>
        );
    }

    return (
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
            Draft
        </span>
    );
}
