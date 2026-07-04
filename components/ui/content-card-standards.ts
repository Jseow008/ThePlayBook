export const CONTENT_CARD_ASPECT_CLASS = "aspect-[2/3]";

export const CONTENT_CARD_IMAGE_SIZES =
    "(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw";

export const COMPACT_SHELF_CARD_CLASS =
    "w-[172px] min-w-[172px] snap-start md:w-[240px] md:min-w-[240px]";

export const COMPACT_SHELF_SKELETON_CARD_CLASS =
    "flex-none w-[172px] md:w-[240px] aspect-[2/3]";

// Keep separate intent names even though both currently share the compact shelf
// size. The browse Suspense fallback and route-level loading state may diverge
// independently if their represented surfaces change.
export const ROUTE_LOADING_SHELF_SKELETON_CARD_CLASS =
    "flex-none w-[172px] md:w-[240px] aspect-[2/3]";

export const READER_COVER_WRAPPER_CLASS = "flex-shrink-0 w-full sm:w-48 md:w-56";
export const READER_COVER_FRAME_CLASS = "aspect-[2/3] w-[140px] sm:w-full";
export const READER_COVER_IMAGE_SIZES =
    "(max-width: 639px) 140px, (max-width: 767px) 192px, 224px";
