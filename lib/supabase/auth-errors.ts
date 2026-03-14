import { isAuthSessionMissingError } from "@supabase/supabase-js";

type AuthUserResult<TUser> = {
    data: { user: TUser | null } | null;
    error: unknown;
};

export function isExpectedMissingSessionError(error: unknown) {
    if (!error) return false;
    if (isAuthSessionMissingError(error)) return true;

    const candidate = error as {
        code?: string;
        message?: string;
        name?: string;
    };

    return (
        candidate.name === "AuthSessionMissingError"
        || candidate.code === "session_not_found"
        || candidate.message === "Auth session missing!"
    );
}

export function resolveAuthUserResult<TUser>(result: AuthUserResult<TUser>) {
    if (isExpectedMissingSessionError(result.error)) {
        return {
            user: null,
            error: null,
        };
    }

    return {
        user: result.data?.user ?? null,
        error: result.error ?? null,
    };
}
