/**
 * Homepage Sections API
 *
 * GET: Fetch all sections (ordered by order_index)
 * POST: Create a new section
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { revalidatePath } from "next/cache";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";

const FilterTypeEnum = z.enum(["author", "category", "title", "featured"]);

const CreateHomepageSectionSchema = z.object({
    title: z.string().trim().min(1, "Title is required"),
    filter_type: FilterTypeEnum,
    filter_value: z.string().trim().min(1, "Filter value is required"),
    order_index: z.number().int().nonnegative().optional(),
    is_active: z.boolean().optional(),
});

export async function GET() {
    const requestId = getRequestId();
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
        .from("homepage_section")
        .select("*")
        .order("order_index", { ascending: true });

    if (error) {
        logApiError({
            requestId,
            route: "/api/admin/sections",
            message: "Failed to fetch homepage sections",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to fetch sections", 500, requestId);
    }

    return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/sections",
            message: "Invalid JSON body for section create",
            error,
        });
        return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
    }

    const parsed = CreateHomepageSectionSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request payload", 400, requestId);
    }

    const supabase = getAdminClient();
    const { title, filter_type, filter_value, order_index, is_active } = parsed.data;

    let finalOrderIndex = order_index;
    if (finalOrderIndex === undefined) {
        const { data: maxOrder, error: maxOrderError } = await supabase
            .from("homepage_section")
            .select("order_index")
            .order("order_index", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (maxOrderError) {
            logApiError({
                requestId,
                route: "/api/admin/sections",
                message: "Failed to resolve max order index",
                error: maxOrderError,
            });
            return apiError("INTERNAL_ERROR", "Failed to create section", 500, requestId);
        }

        finalOrderIndex = (maxOrder?.order_index ?? 0) + 1;
    }

    const insertData: Database["public"]["Tables"]["homepage_section"]["Insert"] = {
        title,
        filter_type,
        filter_value,
        order_index: finalOrderIndex,
        is_active: is_active ?? true,
    };

    const { data, error } = await supabase
        .from("homepage_section")
        .insert(insertData)
        .select()
        .single();

    if (error) {
        logApiError({
            requestId,
            route: "/api/admin/sections",
            message: "Failed to insert homepage section",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to create section", 500, requestId);
    }

    revalidatePath("/");

    return NextResponse.json(data, { status: 201 });
}
