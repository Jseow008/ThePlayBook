/**
 * Homepage Section API - Individual Section
 *
 * PUT: Update a section
 * DELETE: Remove a section
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { revalidatePath } from "next/cache";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";

interface RouteParams {
    params: Promise<{ id: string }>;
}

const FilterTypeEnum = z.enum(["author", "category", "title", "featured"]);

const UpdateHomepageSectionSchema = z
    .object({
        title: z.string().trim().min(1).optional(),
        filter_type: FilterTypeEnum.optional(),
        filter_value: z.string().trim().min(1).optional(),
        order_index: z.number().int().nonnegative().optional(),
        is_active: z.boolean().optional(),
    })
    .refine(
        (data) => Object.values(data).some((value) => value !== undefined),
        { message: "At least one field is required" }
    );

export async function PUT(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/sections/[id]",
            message: "Invalid JSON body for section update",
            error,
        });
        return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
    }
    const parsed = UpdateHomepageSectionSchema.safeParse(body);

    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request payload", 400, requestId);
    }

    const supabase = getAdminClient();
    const updateData: Database["public"]["Tables"]["homepage_section"]["Update"] = {
        updated_at: new Date().toISOString(),
    };

    const { title, filter_type, filter_value, order_index, is_active } = parsed.data;
    if (title !== undefined) updateData.title = title;
    if (filter_type !== undefined) updateData.filter_type = filter_type;
    if (filter_value !== undefined) updateData.filter_value = filter_value;
    if (order_index !== undefined) updateData.order_index = order_index;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
        .from("homepage_section")
        .update(updateData)
        .eq("id", id)
        .select()
        .maybeSingle();

    if (error) {
        logApiError({
            requestId,
            route: "/api/admin/sections/[id]",
            message: "Failed to update homepage section",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to update section", 500, requestId);
    }

    if (!data) {
        return apiError("NOT_FOUND", "Section not found", 404, requestId);
    }

    revalidatePath("/");

    return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
        .from("homepage_section")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

    if (error) {
        logApiError({
            requestId,
            route: "/api/admin/sections/[id]",
            message: "Failed to delete homepage section",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to delete section", 500, requestId);
    }

    if (!data) {
        return apiError("NOT_FOUND", "Section not found", 404, requestId);
    }

    revalidatePath("/");

    return NextResponse.json({ success: true });
}
