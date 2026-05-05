import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { buildCanonicalReadPath, getLegacyReadIdFromPathname } from "@/lib/content-paths";

async function getLegacyReadRedirect(request: NextRequest) {
    const contentId = getLegacyReadIdFromPathname(request.nextUrl.pathname);
    if (!contentId) {
        return null;
    }

    const supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        }
    );

    const { data, error } = await supabase
        .from("content_item")
        .select("id, title")
        .eq("id", contentId)
        .eq("status", "verified")
        .is("deleted_at", null)
        .maybeSingle();

    if (error || !data) {
        return null;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = buildCanonicalReadPath(data.id, data.title);

    return NextResponse.redirect(redirectUrl, 308);
}

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const isAdminApiRoute = pathname.startsWith("/api/admin");

    const legacyReadRedirect = await getLegacyReadRedirect(request);
    if (legacyReadRedirect) {
        return legacyReadRedirect;
    }

    if (pathname.startsWith("/read")) {
        return NextResponse.next({ request });
    }

    const supabaseResponse = await updateSession(request);

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
        "/read/:path*",
        "/notes",
        "/ask",
        "/admin-login",
        "/admin/:path*",
        "/api/admin/:path*",
        "/profile",
        "/settings",
    ],
};
