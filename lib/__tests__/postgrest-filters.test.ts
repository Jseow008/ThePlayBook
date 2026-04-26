import { describe, expect, it } from "vitest";
import { escapePostgrestLikeValue } from "@/lib/postgrest-filters";

describe("postgrest filter helpers", () => {
    it("wraps values with reserved OR-filter punctuation", () => {
        expect(escapePostgrestLikeValue("Dopamine, Neuroplasticity, and Transforming Your Life"))
            .toBe("\"%Dopamine, Neuroplasticity, and Transforming Your Life%\"");
    });

    it("escapes LIKE wildcards", () => {
        expect(escapePostgrestLikeValue("100% focus_plan")).toBe("%100\\% focus\\_plan%");
    });

    it("escapes quotes inside wrapped values", () => {
        expect(escapePostgrestLikeValue("The \"deep work\" method"))
            .toBe("\"%The \\\"deep work\\\" method%\"");
    });
});
