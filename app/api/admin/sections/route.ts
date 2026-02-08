/**
 * Homepage Sections API
 * 
 * GET: Fetch all sections (ordered by order_index)
 * POST: Create a new section
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
    const supabase = await createClient();

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
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, filter_type, filter_value, order_index, is_active } = body;

    // Validate required fields
    if (!title || !filter_type || !filter_value) {
        return NextResponse.json(
            { error: "Missing required fields: title, filter_type, filter_value" },
            { status: 400 }
        );
    }

    // Get max order_index if not provided
    let finalOrderIndex = order_index;
    if (finalOrderIndex === undefined) {
        const { data: maxOrder } = await supabase
            .from("homepage_section")
            .select("order_index")
            .order("order_index", { ascending: false })
            .limit(1)
            .single();
        finalOrderIndex = (maxOrder?.order_index || 0) + 1;
    }

    const { data, error } = await supabase
        .from("homepage_section")
        .insert({
            title,
            filter_type,
            filter_value,
            order_index: finalOrderIndex,
            is_active: is_active ?? true
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}
