import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
    return updateSession(request);
}

export const config = {
    matcher: [
        "/admin/:path*",
        "/api/admin/:path*",
        "/auth/:path*",
        "/login",
        "/profile",
        "/settings",
        "/library/:path*",
    ],
};
