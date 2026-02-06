/**
 * Admin Logout API Route
 * POST /api/admin/logout
 */

import { NextResponse } from "next/server";
import { clearAdminSession } from "@/lib/admin/auth";

export async function POST() {
    try {
        await clearAdminSession();

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
