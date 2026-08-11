import type { ContentItem, HomepageSection } from "@/types/database";

export const BROWSE_LANE_ITEM_LIMIT = 10;
export const BROWSE_LANE_FETCH_LIMIT = BROWSE_LANE_ITEM_LIMIT + 1;

export function hasMoreBrowseItems(items: ContentItem[]) {
    return items.length > BROWSE_LANE_ITEM_LIMIT;
}

export function getBrowseSectionViewAllHref(section: HomepageSection) {
    if (section.filter_type !== "category") {
        return undefined;
    }

    const category = section.filter_value.trim();
    if (!category) {
        return undefined;
    }

    const params = new URLSearchParams({ category });
    return `/search?${params.toString()}`;
}
