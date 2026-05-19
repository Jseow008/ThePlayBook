import { NextRequest, NextResponse } from "next/server";
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
import { rateLimit } from "@/lib/server/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ContentRequestMutationResult } from "@/types/content-requests";

const RequestSchema = z.object({
    input: z.string().trim().min(2).max(500),
    author: z.string().trim().max(180).optional().nullable(),
    content_type: z.enum(["book", "article", "podcast", "video"]).optional(),
});

function cleanOptional(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    try {
        const userClient = await createClient();
        const { data: { user }, error: authError } = await userClient.auth.getUser();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Sign in to submit or vote on requests.", 401, requestId);
        }

        const rl = await rateLimit(request, {
            limit: 5,
            windowMs: 7 * 24 * 60 * 60 * 1000,
            key: "content-request-submit",
            identifier: user.id,
        });

        if (!rl.success) {
            return NextResponse.json(
                { error: { code: "RATE_LIMITED", message: "You can submit up to 5 new requests per week." } },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
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

        if (!normalizedTitle) {
            return apiError("VALIDATION_ERROR", "Enter a clearer title or source URL.", 400, requestId);
        }

        const supabase = getAdminClient();
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
                p_thumbnail_url: cleanOptional(metadata.thumbnail_url),
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
