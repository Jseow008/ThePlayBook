import "server-only";
import type { Json } from "@/types/database";

export function getCardQuickMode(value: Json | undefined): Json {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const result: Record<string, string> = {};
    if (typeof value.hook === "string") result.hook = value.hook;
    if (typeof value.big_idea === "string") result.big_idea = value.big_idea;
    return result;
}

export function toContentCardData<T extends { quick_mode_json?: Json }>(item: T) {
    return { ...item, quick_mode_json: getCardQuickMode(item.quick_mode_json) };
}
