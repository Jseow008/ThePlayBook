type QuickModeShape = {
    hook?: string | null;
    big_idea?: string | null;
    key_takeaways?: string[] | null;
} | null | undefined;

type SegmentShape = {
    markdown_body?: string | null;
} | null | undefined;

type ContentStatus = "draft" | "verified";

type EmbeddingFields = {
    title?: string | null;
    author?: string | null;
    type?: string | null;
    category?: string | null;
    quick_mode_json?: QuickModeShape;
};

export type PublishValidationIssue = {
    path: string[];
    message: string;
};

type VerifiedContentCandidate = {
    status: ContentStatus;
    cover_image_url?: string | null;
    category?: string | null;
    quick_mode_json?: QuickModeShape;
    segments?: SegmentShape[] | null;
};

function hasText(value: string | null | undefined) {
    return typeof value === "string" && value.trim().length > 0;
}

function hasValidQuickMode(quickMode: QuickModeShape) {
    if (!quickMode || typeof quickMode !== "object") {
        return false;
    }

    const takeaways = Array.isArray(quickMode.key_takeaways)
        ? quickMode.key_takeaways.filter((takeaway) => hasText(takeaway))
        : [];

    return hasText(quickMode.hook) && hasText(quickMode.big_idea) && takeaways.length > 0;
}

function hasPublishedSegments(segments: SegmentShape[] | null | undefined) {
    if (!Array.isArray(segments) || segments.length === 0) {
        return false;
    }

    return segments.some((segment) => hasText(segment?.markdown_body));
}

export function getVerifiedContentIssues(candidate: VerifiedContentCandidate): PublishValidationIssue[] {
    if (candidate.status !== "verified") {
        return [];
    }

    const issues: PublishValidationIssue[] = [];

    if (!hasText(candidate.cover_image_url)) {
        issues.push({
            path: ["cover_image_url"],
            message: "A cover image is required before content can be verified",
        });
    }

    if (!hasText(candidate.category)) {
        issues.push({
            path: ["category"],
            message: "A category is required before content can be verified",
        });
    }

    if (!hasValidQuickMode(candidate.quick_mode_json)) {
        issues.push({
            path: ["quick_mode_json"],
            message: "A valid quick mode summary is required before content can be verified",
        });
    }

    if (!hasPublishedSegments(candidate.segments)) {
        issues.push({
            path: ["segments"],
            message: "At least one non-empty segment is required before content can be verified",
        });
    }

    return issues;
}

function normalizeQuickMode(quickMode: QuickModeShape) {
    if (!quickMode || typeof quickMode !== "object") {
        return null;
    }

    const hook = typeof quickMode.hook === "string" ? quickMode.hook.trim() : "";
    const bigIdea = typeof quickMode.big_idea === "string" ? quickMode.big_idea.trim() : "";

    return {
        hook: hook.length > 0 ? hook : null,
        big_idea: bigIdea.length > 0 ? bigIdea : null,
        key_takeaways: Array.isArray(quickMode.key_takeaways)
            ? quickMode.key_takeaways
                .filter((takeaway): takeaway is string => hasText(takeaway))
                .map((takeaway) => takeaway.trim())
            : [],
    };
}

export function shouldInvalidateContentEmbedding(params: {
    currentStatus: ContentStatus;
    nextStatus: ContentStatus;
    current: EmbeddingFields;
    next: EmbeddingFields;
}) {
    if (params.nextStatus !== "verified") {
        return false;
    }

    if (params.currentStatus !== "verified") {
        return true;
    }

    return (
        (params.current.title ?? null) !== (params.next.title ?? null)
        || (params.current.author ?? null) !== (params.next.author ?? null)
        || (params.current.type ?? null) !== (params.next.type ?? null)
        || (params.current.category ?? null) !== (params.next.category ?? null)
        || JSON.stringify(normalizeQuickMode(params.current.quick_mode_json))
        !== JSON.stringify(normalizeQuickMode(params.next.quick_mode_json))
    );
}
