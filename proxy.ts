import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
    const supabaseResponse = await updateSession(request);
    const pathname = request.nextUrl.pathname;
    const isAdminApiRoute = pathname.startsWith("/api/admin");

    if (pathname.startsWith("/admin") || isAdminApiRoute) {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll() { },
                },
            }
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            if (isAdminApiRoute) {
                return NextResponse.json(
                    { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
                    { status: 401 }
                );
            }
            return NextResponse.redirect(new URL("/login?next=" + request.nextUrl.pathname, request.url));
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (!profile || profile.role !== "admin") {
            if (isAdminApiRoute) {
                return NextResponse.json(
                    { error: { code: "FORBIDDEN", message: "Admin access required" } },
                    { status: 403 }
                );
            }
            return NextResponse.redirect(new URL("/", request.url));
        }
    }

    return supabaseResponse;
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
