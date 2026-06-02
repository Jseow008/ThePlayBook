import { describe, expect, it, vi } from "vitest";
import {
    ANALYTICS_SCHEMA_VERSION,
    sanitizeAnalyticsProperties,
} from "@/lib/analytics-events";

describe("sanitizeAnalyticsProperties", () => {
    it("adds the analytics schema version", () => {
        expect(
            sanitizeAnalyticsProperties("email_subscribed", {
                source: "landing_final_cta",
            })
        ).toEqual({
            schema_version: ANALYTICS_SCHEMA_VERSION,
            source: "landing_final_cta",
        });
    });

    it("drops unregistered and sensitive properties", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        expect(
            sanitizeAnalyticsProperties("note_created", {
                content_id: "content-1",
                note_length: 120,
                note_body: "Do not send raw note text",
                unexpected: "ignored",
            } as never)
        ).toEqual({
            schema_version: ANALYTICS_SCHEMA_VERSION,
            content_id: "content-1",
            note_length: 120,
        });

        warnSpy.mockRestore();
    });

    it("warns when required properties are missing", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        expect(
            sanitizeAnalyticsProperties("content_opened", {} as never)
        ).toEqual({
            schema_version: ANALYTICS_SCHEMA_VERSION,
        });
        expect(warnSpy).toHaveBeenCalledWith(
            '[analytics] content_opened missing required property "content_id".'
        );

        warnSpy.mockRestore();
    });

    it("allows search metadata but not raw query text", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        expect(
            sanitizeAnalyticsProperties("search_performed", {
                source: "site_search",
                search_scope: "content",
                query_present: true,
                query_length: 14,
                result_count: 8,
                filters_count: 1,
                query: "private search",
            } as never)
        ).toEqual({
            schema_version: ANALYTICS_SCHEMA_VERSION,
            source: "site_search",
            search_scope: "content",
            query_present: true,
            query_length: 14,
            result_count: 8,
            filters_count: 1,
        });

        warnSpy.mockRestore();
    });
});
