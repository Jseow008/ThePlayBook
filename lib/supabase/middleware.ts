import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import type { User } from "@supabase/supabase-js";

type CookieToSet = {
    name: string;
    value: string;
    options: CookieOptions;
};

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet: CookieToSet[]) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

                    supabaseResponse = NextResponse.next({
                        request,
                    });

                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const hasAuthCookie = request.cookies.getAll().some(({ name }) =>
        name.startsWith("sb-")
        && name.includes("-auth-token")
        && !name.endsWith("-code-verifier")
    );
    if (!hasAuthCookie) {
        return { response: supabaseResponse, user: null as User | null };
    }

    // Keep auth cookie fresh for routes that pass through the proxy.
    const { data: { user } } = await supabase.auth.getUser();

    return { response: supabaseResponse, user };
}
