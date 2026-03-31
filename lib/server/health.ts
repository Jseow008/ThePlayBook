import { isErrorReportingConfigured } from "@/lib/server/error-reporting";

export type ReadinessState =
    | "ready"
    | "missing"
    | "invalid"
    | "derived"
    | "not_configured";

export type RuntimeReadiness = {
    environment: string;
    status: "ready" | "degraded";
    checks: {
        supabase_public: ReadinessState;
        supabase_admin: ReadinessState;
        site_url: ReadinessState;
        app_url: ReadinessState;
        ai_generation: ReadinessState;
        ai_retrieval: ReadinessState;
        rate_limiting: ReadinessState;
        error_reporting: ReadinessState;
    };
    issues: string[];
};

function hasNonEmptyEnv(value: string | undefined) {
    return Boolean(value && value.trim().length > 0);
}

function isValidUrl(value: string | undefined) {
    if (!hasNonEmptyEnv(value)) {
        return false;
    }

    try {
        new URL(value as string);
        return true;
    } catch {
        return false;
    }
}

export function getRuntimeReadiness(env: NodeJS.ProcessEnv = process.env): RuntimeReadiness {
    const environment = env.NODE_ENV ?? "development";
    const isProduction = environment === "production";
    const issues: string[] = [];

    const hasSupabasePublicUrl = hasNonEmptyEnv(env.NEXT_PUBLIC_SUPABASE_URL);
    const hasSupabaseAnonKey = hasNonEmptyEnv(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const hasSupabaseServiceKey = hasNonEmptyEnv(env.SUPABASE_SERVICE_KEY);
    const hasSiteUrl = hasNonEmptyEnv(env.NEXT_PUBLIC_SITE_URL);
    const hasAppUrl = hasNonEmptyEnv(env.NEXT_PUBLIC_APP_URL);
    const hasAnthropic = hasNonEmptyEnv(env.ANTHROPIC_API_KEY);
    const hasOpenAI = hasNonEmptyEnv(env.OPENAI_API_KEY);
    const hasGemini = hasNonEmptyEnv(env.GEMINI_API_KEY);
    const hasUpstashUrl = hasNonEmptyEnv(env.UPSTASH_REDIS_REST_URL);
    const hasUpstashToken = hasNonEmptyEnv(env.UPSTASH_REDIS_REST_TOKEN);
    const hasErrorReporting = isErrorReportingConfigured(env);

    const checks: RuntimeReadiness["checks"] = {
        supabase_public: hasSupabasePublicUrl && hasSupabaseAnonKey ? "ready" : "missing",
        supabase_admin: hasSupabasePublicUrl && hasSupabaseServiceKey ? "ready" : "missing",
        site_url: !hasSiteUrl ? "missing" : isValidUrl(env.NEXT_PUBLIC_SITE_URL) ? "ready" : "invalid",
        app_url: !hasAppUrl
            ? hasSiteUrl && isValidUrl(env.NEXT_PUBLIC_SITE_URL)
                ? "derived"
                : "not_configured"
            : isValidUrl(env.NEXT_PUBLIC_APP_URL)
                ? "ready"
                : "invalid",
        ai_generation: hasAnthropic || hasOpenAI ? "ready" : "missing",
        ai_retrieval: hasGemini ? "ready" : "missing",
        rate_limiting: hasUpstashUrl && hasUpstashToken
            ? "ready"
            : isProduction
                ? "missing"
                : "not_configured",
        error_reporting: hasErrorReporting
            ? "ready"
            : isProduction
                ? "missing"
                : "not_configured",
    };

    if (checks.supabase_public !== "ready") {
        issues.push("Supabase public client configuration is incomplete.");
    }

    if (checks.supabase_admin !== "ready") {
        issues.push("Supabase admin client configuration is incomplete.");
    }

    if (checks.site_url !== "ready") {
        issues.push("NEXT_PUBLIC_SITE_URL is missing or invalid.");
    }

    if (checks.app_url === "invalid") {
        issues.push("NEXT_PUBLIC_APP_URL is invalid.");
    }

    if (checks.ai_generation !== "ready") {
        issues.push("AI generation requires an Anthropic or OpenAI API key.");
    }

    if (checks.ai_retrieval !== "ready") {
        issues.push("Ask My Library retrieval requires GEMINI_API_KEY.");
    }

    if (checks.rate_limiting === "missing") {
        issues.push("Production rate limiting requires Upstash Redis configuration.");
    }

    if (checks.error_reporting === "missing") {
        issues.push("Production exception monitoring requires ERROR_REPORTING_WEBHOOK_URL.");
    }

    return {
        environment,
        status: issues.length === 0 ? "ready" : "degraded",
        checks,
        issues,
    };
}
