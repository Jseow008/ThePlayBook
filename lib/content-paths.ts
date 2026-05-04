const FALLBACK_READ_SLUG = "read";

export function slugifyContentTitle(title: string) {
    const slug = title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");

    return slug || FALLBACK_READ_SLUG;
}

export function buildReadPath(item: { id: string; title: string }) {
    return `/read/${item.id}/${slugifyContentTitle(item.title)}`;
}

export function buildCanonicalReadPath(id: string, title: string) {
    return buildReadPath({ id, title });
}

export function isCanonicalReadSlug(slugSegments: string[] | undefined, title: string) {
    return slugSegments?.length === 1 && slugSegments[0] === slugifyContentTitle(title);
}

export function getLegacyReadIdFromPathname(pathname: string) {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "read") {
        return null;
    }

    try {
        return decodeURIComponent(segments[1]);
    } catch {
        return null;
    }
}
