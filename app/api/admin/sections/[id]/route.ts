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
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateHomepageSectionSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid request payload", details: parsed.error.errors },
            { status: 400 }
        );
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
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
        return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    revalidatePath("/");

    return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
        return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    revalidatePath("/");

    return NextResponse.json({ success: true });
}
