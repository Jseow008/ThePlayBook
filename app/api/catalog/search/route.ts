import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { CatalogSearchError, normalizeCatalogSearchQuery, searchCatalog } from "@/lib/server/catalog-search";

const SearchParamsSchema = z.object({
    q: z.string().max(512).optional(),
    category: z.string().trim().max(120).optional(),
    type: z.enum(["book", "podcast", "article"]).optional(),
    cursor: z.string().max(2048).optional(),
});

export async function GET(request: NextRequest) {
    const requestId = getRequestId();
    const parsed = SearchParamsSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid catalog search.", 400, requestId);

    try {
        const result = await searchCatalog({
            query: normalizeCatalogSearchQuery(parsed.data.q),
            categories: parsed.data.category ? [parsed.data.category] : [],
            type: parsed.data.type ?? null,
            cursor: parsed.data.cursor ?? null,
        });
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof CatalogSearchError && error.code === "CURSOR_INVALID") {
            return apiError("VALIDATION_ERROR", error.message, 400, requestId, { search_error: error.code });
        }
        const failureRequestId = error instanceof CatalogSearchError && error.requestId ? error.requestId : requestId;
        if (!(error instanceof CatalogSearchError && error.requestId)) {
            logApiError({ requestId: failureRequestId, route: "GET /api/catalog/search", message: "Catalog search failed", error });
        }
        return apiError("INTERNAL_ERROR", "Catalog search is temporarily unavailable. Please try again.", 503, failureRequestId);
    }
}
