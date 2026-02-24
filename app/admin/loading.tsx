/**
 * Admin Dashboard Loading Skeleton
 *
 * Shown during route transitions in the admin layout.
 * Mimics the admin table layout: header bar + table rows.
 */
export default function AdminLoading() {
    return (
        <div className="p-6 space-y-6 animate-pulse">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <div className="h-7 w-48 bg-zinc-200 rounded-md" />
                <div className="flex items-center gap-3">
                    <div className="h-9 w-32 bg-zinc-200/50 rounded-full" />
                    <div className="h-9 w-9 bg-zinc-200/50 rounded-full" />
                </div>
            </div>

            {/* Search / filter bar */}
            <div className="h-10 w-full max-w-sm bg-zinc-100 rounded-lg" />

            {/* Table skeleton */}
            <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
                {/* Table header */}
                <div className="flex items-center gap-4 px-4 py-3 bg-zinc-50 border-b border-zinc-200">
                    {[120, 80, 60, 100, 60].map((w, i) => (
                        <div
                            key={i}
                            className="h-4 bg-zinc-200 rounded"
                            style={{ width: `${w}px` }}
                        />
                    ))}
                </div>

                {/* Table rows */}
                {Array.from({ length: 8 }).map((_, row) => (
                    <div
                        key={row}
                        className="flex items-center gap-4 px-4 py-4 border-b border-zinc-100 last:border-0"
                    >
                        <div className="h-4 w-[120px] bg-zinc-100 rounded" />
                        <div className="h-4 w-[80px] bg-zinc-50 rounded" />
                        <div className="h-4 w-[60px] bg-zinc-50 rounded" />
                        <div className="h-4 w-[100px] bg-zinc-50 rounded" />
                        <div className="h-6 w-[60px] bg-zinc-100 rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}
