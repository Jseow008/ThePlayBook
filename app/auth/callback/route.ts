import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/auth-redirect";

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = normalizeNextPath(searchParams.get("next"));

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            const forwardedHost = request.headers.get("x-forwarded-host");
            const isLocalEnv = process.env.NODE_ENV === "development";

            let redirectUrl = `${origin}${next}`;
            if (!isLocalEnv && forwardedHost) {
                redirectUrl = `https://${forwardedHost}${next}`;
            }

            return NextResponse.redirect(redirectUrl);
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=AuthCodeError`);
}
