export const CONTENT_CARD_ASPECT_CLASS = "aspect-[2/3]";

export const CONTENT_CARD_IMAGE_SIZES =
    "(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw";

export const COMPACT_SHELF_IMAGE_SIZES = "(max-width: 767px) 176px, 240px";

export const COMPACT_SHELF_CARD_CLASS =
    "w-[176px] min-w-[176px] snap-start md:w-[240px] md:min-w-[240px]";

export const COMPACT_SHELF_SKELETON_CARD_CLASS =
    "flex-none w-[176px] md:w-[240px] aspect-[2/3]";

// Keep separate intent names even though both currently share the compact shelf
// size. The browse Suspense fallback and route-level loading state may diverge
// independently if their represented surfaces change.
export const ROUTE_LOADING_SHELF_SKELETON_CARD_CLASS =
    "flex-none w-[176px] md:w-[240px] aspect-[2/3]";

export const READER_COVER_WRAPPER_CLASS = "flex-shrink-0 w-full sm:w-48 md:w-56";
export const READER_COVER_FRAME_CLASS = "aspect-[2/3] w-[140px] sm:w-full";
export const READER_COVER_IMAGE_SIZES =
    "(max-width: 639px) 140px, (max-width: 767px) 192px, 224px";

// Compact reader identity block; keep Preview sizing independent.
export const COMPACT_READER_HERO_CLASS =
    "grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-4 gap-y-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center sm:gap-x-6";
export const COMPACT_READER_COVER_WRAPPER_CLASS =
    "w-16 shrink-0 sm:w-28 sm:self-center";
export const COMPACT_READER_COVER_FRAME_CLASS = "aspect-[2/3] w-full";
export const COMPACT_READER_COVER_IMAGE_SIZES = "(max-width: 639px) 64px, 112px";

// Preview is more compact below sm; reader cover sizing stays independent.
export const PREVIEW_COVER_FRAME_CLASS = "aspect-[2/3] w-[96px] sm:w-full";
export const PREVIEW_COVER_IMAGE_SIZES =
    "(max-width: 639px) 96px, (max-width: 767px) 192px, 224px";
