/**
 * Admin Logout API Route
 * POST /api/admin/logout
 * 
 * Signs out the current user using Supabase Auth.
 */

import { NextResponse } from "next/server";
import { signOut } from "@/lib/admin/auth";

export async function POST() {
    try {
        await signOut();

        return NextResponse.json({
            success: true,
            message: "Logged out successfully",
        });
    } catch (error) {
        console.error("Admin logout error:", error);
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: "INTERNAL_ERROR",
                    message: "An error occurred during logout",
                },
            },
            { status: 500 }
        );
    }
}
