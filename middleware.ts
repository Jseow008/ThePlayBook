import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
    const supabaseResponse = await updateSession(request);

    // Check if the route is an admin route
    if (request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/api/admin')) {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll() { } // Read-only in middleware checks after updateSession
                }
            }
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.redirect(new URL('/login?next=' + request.nextUrl.pathname, request.url));
        }

        // Check admin role
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (!profile || profile.role !== 'admin') {
            return NextResponse.redirect(new URL('/', request.url));
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
