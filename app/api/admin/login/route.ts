/**
 * Admin Login API Route
 * POST /api/admin/login
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPassword, createAdminSession } from "@/lib/admin/auth";

const LoginSchema = z.object({
    password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const parsed = LoginSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "Invalid request",
                        details: parsed.error.errors,
                    },
                },
                { status: 400 }
            );
        }

        const { password } = parsed.data;

        if (!verifyAdminPassword(password)) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "UNAUTHORIZED",
                        message: "Invalid password",
                    },
                },
                { status: 401 }
            );
        }

        // Create session cookie
        await createAdminSession();

        return NextResponse.json({
            success: true,
            message: "Login successful",
        });
    } catch (error) {
        console.error("Admin login error:", error);
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: "INTERNAL_ERROR",
                    message: "An error occurred during login",
                },
            },
            { status: 500 }
        );
    }
}
