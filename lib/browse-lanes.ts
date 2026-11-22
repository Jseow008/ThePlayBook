import type { ContentItem, HomepageSection } from "@/types/database";

export const BROWSE_LANE_ITEM_LIMIT = 10;
export const BROWSE_LANE_FETCH_LIMIT = BROWSE_LANE_ITEM_LIMIT + 1;

export function hasMoreBrowseItems(items: ContentItem[]) {
    return items.length > BROWSE_LANE_ITEM_LIMIT;
}

export function getBrowseSectionViewAllHref(section: HomepageSection) {
    return `/browse/shelf/${section.id}`;
}
