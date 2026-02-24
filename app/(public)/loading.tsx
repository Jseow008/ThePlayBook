/**
 * Public Route Loading Skeleton
 *
 * Shown during route transitions in the public (public) layout.
 * Mimics the homepage layout: hero block + 3 content lanes.
 */
export default function Loading() {
    return (
        <div className="lg:pl-16 pb-20 lg:pb-0 animate-pulse">
            {/* Hero Skeleton */}
            <div className="relative w-full aspect-[16/9] sm:h-[55vh] bg-secondary/50 rounded-b-xl" />

            {/* Content Lanes */}
            <div className="px-5 sm:px-8 py-10 space-y-12">
                {[1, 2, 3].map((lane) => (
                    <div key={lane} className="space-y-4">
                        {/* Lane Title */}
                        <div className="h-5 w-40 bg-secondary/60 rounded-full" />
                        {/* Cards Row */}
                        <div className="flex gap-3 overflow-hidden">
                            {[1, 2, 3, 4, 5, 6].map((card) => (
                                <div
                                    key={card}
                                    className="flex-none w-[120px] sm:w-[140px] aspect-[2/3] bg-secondary/50 rounded-md"
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
