import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

describe("bounded collection validation", () => {
    it("rejects an oversized collection before validating its items", () => {
        const item = vi.fn((value: string) => value);
        const schema = z.array(z.string().transform(item)).max(50);
        const result = schema.safeParse(Array(1000).fill("synthetic"));
        expect(result.success).toBe(false);
        expect(item).not.toHaveBeenCalled();
        if (!result.success) expect(result.error.issues).toHaveLength(1);
        expect(schema.parse(Array(50).fill("synthetic"))).toHaveLength(50);
        expect(item).toHaveBeenCalledTimes(50);
    });
});
