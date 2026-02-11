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

const FilterTypeEnum = z.enum(["author", "category", "title", "featured"]);

const CreateHomepageSectionSchema = z.object({
    title: z.string().trim().min(1, "Title is required"),
    filter_type: FilterTypeEnum,
    filter_value: z.string().trim().min(1, "Filter value is required"),
    order_index: z.number().int().nonnegative().optional(),
    is_active: z.boolean().optional(),
});

export async function GET() {
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
        .from("homepage_section")
        .select("*")
        .order("order_index", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateHomepageSectionSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid request payload", details: parsed.error.errors },
            { status: 400 }
        );
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
            return NextResponse.json({ error: maxOrderError.message }, { status: 500 });
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
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}
