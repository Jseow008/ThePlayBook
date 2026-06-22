import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
    withSentryConfig: (config: unknown) => config,
}));

describe("security headers", () => {
    it("configures CSP violation reporting", async () => {
        const { cspReportEndpoint, securityHeaders } = await import("@/next.config");
        const csp = securityHeaders.find((header) => header.key === "Content-Security-Policy")?.value;
        const reportingEndpoints = securityHeaders.find((header) => header.key === "Reporting-Endpoints")?.value;

        expect(cspReportEndpoint).toBe("/api/security/csp-report");
        expect(csp).toContain("report-uri /api/security/csp-report");
        expect(csp).toContain("report-to csp-endpoint");
        expect(reportingEndpoints).toBe('csp-endpoint="http://localhost:3000/api/security/csp-report"');
    });

    it("adds a production report-only script policy without unsafe-inline", async () => {
        const { buildSecurityHeaders } = await import("@/next.config");
        const headers = buildSecurityHeaders(true);
        const enforcedCsp = headers.find((header) => header.key === "Content-Security-Policy")?.value;
        const reportOnlyCsp = headers.find((header) => header.key === "Content-Security-Policy-Report-Only")?.value;

        expect(enforcedCsp).toContain("script-src 'self' 'unsafe-inline'");
        expect(reportOnlyCsp).toContain("script-src 'self';");
        expect(reportOnlyCsp).not.toContain("script-src 'self' 'unsafe-inline'");
        expect(reportOnlyCsp).toContain("report-uri /api/security/csp-report");
        expect(reportOnlyCsp).toContain("report-to csp-endpoint");
    });

    it("does not emit the strict report-only trial header outside production", async () => {
        const { buildSecurityHeaders } = await import("@/next.config");
        const headers = buildSecurityHeaders(false);

        expect(headers.some((header) => header.key === "Content-Security-Policy-Report-Only")).toBe(false);
    });
});
