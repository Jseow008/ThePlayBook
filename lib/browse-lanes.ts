import type { ContentItem, HomepageSection } from "@/types/database";

export const BROWSE_LANE_ITEM_LIMIT = 10;
export const BROWSE_LANE_FETCH_LIMIT = BROWSE_LANE_ITEM_LIMIT + 1;

export function hasMoreBrowseItems(items: ContentItem[]) {
    return items.length > BROWSE_LANE_ITEM_LIMIT;
}

export function getBrowseSectionViewAllHref(section: HomepageSection) {
    const filterValue = section.filter_value.trim();
    if (!filterValue) {
        return undefined;
    }

    const params = new URLSearchParams();

    if (section.filter_type === "category") {
        params.set("category", filterValue);
    } else if (section.filter_type === "author" || section.filter_type === "title") {
        params.set("q", filterValue);
    } else {
        return undefined;
    }

    return `/search?${params.toString()}`;
}
