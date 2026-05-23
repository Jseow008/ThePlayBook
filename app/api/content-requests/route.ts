import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    deriveUrlTitle,
    inferContentType,
    normalizeText,
    normalizeUrl,
    parseMaybeUrl,
    splitTitleAndAuthor,
} from "@/lib/content-requests";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { fetchRequestMetadata } from "@/lib/server/content-request-metadata";
import { fetchContentRequestById } from "@/lib/server/content-requests";
import { resolveRequestThumbnail } from "@/lib/server/request-thumbnails";
import { rateLimit } from "@/lib/server/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ContentRequestMutationResult } from "@/types/content-requests";

const RequestSchema = z.object({
    input: z.string().trim().min(2).max(500),
    author: z.string().trim().max(180).optional().nullable(),
    content_type: z.enum(["book", "article", "podcast", "video"]).optional(),
});

const NEW_REQUEST_LIMIT = 5;
const REQUEST_ATTEMPT_LIMIT = 30;
const REQUEST_LIMIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function cleanOptional(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

async function findExistingContentRequestId({
    supabase,
    normalizedUrl,
    normalizedTitle,
    normalizedAuthor,
    contentType,
}: {
    supabase: any;
    normalizedUrl: string | null;
    normalizedTitle: string;
    normalizedAuthor: string | null;
    contentType: string;
}) {
    let query = supabase.from("content_requests")
        .select("id")
        .is("hidden_at", null)
        .order("created_at", { ascending: true })
        .limit(1);

    if (normalizedUrl) {
        query = query.eq("normalized_url", normalizedUrl);
    } else {
        query = query
            .is("normalized_url", null)
            .eq("content_type", contentType)
            .eq("normalized_title", normalizedTitle);

        if (normalizedAuthor) {
            query = query.eq("normalized_author", normalizedAuthor);
        } else {
            query = query.is("normalized_author", null);
        }
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
}

async function countRecentNewRequests({
    supabase,
    userId,
}: {
    supabase: any;
    userId: string;
}) {
    const since = new Date(Date.now() - REQUEST_LIMIT_WINDOW_MS).toISOString();
    const { count, error } = await supabase.from("content_requests")
        .select("id", { count: "exact", head: true })
        .eq("submitted_by", userId)
        .gte("created_at", since);

    if (error) throw error;
    return count ?? 0;
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    try {
        const userClient = await createClient();
        const { data: { user }, error: authError } = await userClient.auth.getUser();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Sign in to submit or vote on requests.", 401, requestId);
        }

        const attemptLimit = await rateLimit(request, {
            limit: REQUEST_ATTEMPT_LIMIT,
            windowMs: REQUEST_LIMIT_WINDOW_MS,
            key: "content-request-submit-attempt",
            identifier: user.id,
        });

        if (!attemptLimit.success) {
            return NextResponse.json(
                { error: { code: "RATE_LIMITED", message: "Too many request attempts. Please wait and try again." } },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.ceil((attemptLimit.retryAfterMs ?? 60_000) / 1000)) },
                }
            );
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid request body.", 400, requestId);
        }

        const parsed = RequestSchema.safeParse(body);
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Enter a title, creator, or source URL.", 400, requestId);
        }

        const input = parsed.data.input;
        const url = parseMaybeUrl(input);
        const normalizedUrl = normalizeUrl(input);
        const metadata = normalizedUrl ? await fetchRequestMetadata(normalizedUrl) : {};
        const textParts = splitTitleAndAuthor(input);
        const contentType = inferContentType(input, parsed.data.content_type ?? "book");
        const title = cleanOptional(metadata.title)
            || (url ? deriveUrlTitle(input) : textParts.title);
        const author = cleanOptional(parsed.data.author) || (url ? null : textParts.author);
        const normalizedTitle = normalizeText(title);
        const normalizedAuthor = author ? normalizeText(author) : null;
        const submittedThumbnailUrl = contentType === "book" ? null : cleanOptional(metadata.thumbnail_url);

        if (!normalizedTitle) {
            return apiError("VALIDATION_ERROR", "Enter a clearer title or source URL.", 400, requestId);
        }

        const supabase = getAdminClient();
        const existingRequestId = await findExistingContentRequestId({
            supabase,
            normalizedUrl,
            normalizedTitle,
            normalizedAuthor,
            contentType,
        });

        if (!existingRequestId) {
            const recentNewRequestCount = await countRecentNewRequests({
                supabase,
                userId: user.id,
            });

            if (recentNewRequestCount >= NEW_REQUEST_LIMIT) {
                return NextResponse.json(
                    {
                        error: {
                            code: "RATE_LIMITED",
                            message: `You can submit up to ${NEW_REQUEST_LIMIT} new requests per week. You can still vote on existing requests.`,
                        },
                    },
                    { status: 429 }
                );
            }
        }

        const { data: submitResult, error: submitError } = await (supabase as any)
            .rpc("submit_content_request", {
                p_user_id: user.id,
                p_title: title,
                p_author: author,
                p_source_url: normalizedUrl,
                p_normalized_url: normalizedUrl,
                p_normalized_title: normalizedTitle,
                p_normalized_author: normalizedAuthor,
                p_content_type: contentType,
                p_thumbnail_url: submittedThumbnailUrl,
            })
            .single();

        if (submitError) {
            throw submitError;
        }

        const result = submitResult as {
            request_id: string;
            duplicate: boolean;
            voted: boolean;
        };
        const createdRequest = await fetchContentRequestById(result.request_id);

        if (!createdRequest) {
            return apiError("NOT_FOUND", "The saved request could not be loaded.", 404, requestId);
        }

        if (contentType === "book" && !createdRequest.thumbnail_url) {
            after(async () => {
                try {
                    const thumbnailUrl = await resolveRequestThumbnail({
                        content_type: contentType,
                        title,
                        author,
                        source_url: normalizedUrl,
                    });

                    if (!thumbnailUrl) return;

                    const { error: thumbnailError } = await (supabase as any)
                        .from("content_requests")
                        .update({ thumbnail_url: thumbnailUrl })
                        .eq("id", result.request_id)
                        .eq("content_type", "book")
                        .is("thumbnail_url", null);

                    if (thumbnailError) {
                        throw thumbnailError;
                    }
                } catch (backgroundError) {
                    logApiError({
                        requestId,
                        route: "/api/content-requests[POST]",
                        message: "Background request thumbnail resolution failed",
                        error: backgroundError,
                    });
                }
            });
        }

        return NextResponse.json({
            success: true,
            data: {
                request: createdRequest,
                voted: result.voted,
                duplicate: result.duplicate,
            } satisfies ContentRequestMutationResult,
        }, { status: result.duplicate ? 200 : 201 });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/content-requests[POST]",
            message: "Failed to submit content request",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not save this request right now.", 500, requestId);
    }
}
