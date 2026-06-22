import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import {
    rateLimit,
    rateLimitFailureResponse,
    RateLimitBackendUnavailableError,
} from "@/lib/server/rate-limit";

const MAX_REPORTS_PER_REQUEST = 10;
const MAX_FIELD_LENGTH = 256;

type UnknownRecord = Record<string, unknown>;

type SanitizedCspReport = {
    document_uri?: string;
    blocked_uri?: string;
    violated_directive?: string;
    effective_directive?: string;
    source_file?: string;
    line_number?: number;
    column_number?: number;
    status_code?: number;
    disposition?: string;
    has_script_sample?: boolean;
};

function truncate(value: string) {
    return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}...` : value;
}

function getString(record: UnknownRecord, key: string) {
    const value = record[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(record: UnknownRecord, key: string) {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sanitizeUrl(value: string | undefined, mode: "path" | "origin" | "token") {
    if (!value) {
        return undefined;
    }

    const trimmed = truncate(value.trim());
    const lower = trimmed.toLowerCase();
    const safeTokens = new Set(["inline", "eval", "data", "blob", "self"]);

    if (mode === "token" && safeTokens.has(lower.replace(/^'|'$/g, ""))) {
        return lower.replace(/^'|'$/g, "");
    }

    try {
        const parsed = new URL(trimmed);
        if (mode === "origin" || mode === "token") {
            return parsed.origin;
        }

        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return mode === "token" ? truncate(trimmed.split(/[?#]/)[0] ?? trimmed) : undefined;
    }
}

function sanitizeReport(report: UnknownRecord): SanitizedCspReport | null {
    const sanitized: SanitizedCspReport = {
        document_uri: sanitizeUrl(getString(report, "document-uri"), "path"),
        blocked_uri: sanitizeUrl(getString(report, "blocked-uri"), "token"),
        violated_directive: getString(report, "violated-directive"),
        effective_directive: getString(report, "effective-directive"),
        source_file: sanitizeUrl(getString(report, "source-file"), "path"),
        line_number: getNumber(report, "line-number"),
        column_number: getNumber(report, "column-number"),
        status_code: getNumber(report, "status-code"),
        disposition: getString(report, "disposition"),
        has_script_sample: Boolean(getString(report, "script-sample")),
    };

    const hasUsefulField = Object.values(sanitized).some((value) => value !== undefined && value !== false);
    return hasUsefulField ? sanitized : null;
}

function isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractReports(payload: unknown): UnknownRecord[] {
    if (Array.isArray(payload)) {
        return payload
            .slice(0, MAX_REPORTS_PER_REQUEST)
            .map((entry) => {
                if (!isRecord(entry)) {
                    return null;
                }

                const body = entry.body;
                return entry.type === "csp-violation" && isRecord(body) ? body : null;
            })
            .filter((entry): entry is UnknownRecord => Boolean(entry));
    }

    if (!isRecord(payload)) {
        return [];
    }

    const legacyReport = payload["csp-report"];
    if (isRecord(legacyReport)) {
        return [legacyReport];
    }

    const body = payload.body;
    if (payload.type === "csp-violation" && isRecord(body)) {
        return [body];
    }

    return [payload];
}

function recordCspReport(report: SanitizedCspReport) {
    console.warn("CSP violation", report);

    Sentry.withScope((scope) => {
        scope.setLevel("warning");
        scope.setTag("source", "csp");

        if (report.effective_directive) {
            scope.setTag("effective_directive", report.effective_directive);
        }

        if (report.violated_directive) {
            scope.setTag("violated_directive", report.violated_directive);
        }

        if (report.disposition) {
            scope.setTag("disposition", report.disposition);
        }

        scope.setContext("csp_report", report);
        Sentry.captureMessage("CSP violation");
    });
}

export async function POST(request: NextRequest) {
    let rl;
    try {
        rl = await rateLimit(request, {
            limit: 30,
            windowMs: 60_000,
            key: "csp-report",
        });
    } catch (error) {
        if (error instanceof RateLimitBackendUnavailableError) {
            return rateLimitFailureResponse({
                success: false,
                retryAfterMs: 60_000,
                unavailable: true,
            });
        }

        throw error;
    }

    if (!rl.success) {
        return rateLimitFailureResponse(rl, "Too many CSP reports.");
    }

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid CSP report." }, { status: 400 });
    }

    const reports = extractReports(payload)
        .map(sanitizeReport)
        .filter((report): report is SanitizedCspReport => Boolean(report));

    if (reports.length === 0) {
        return NextResponse.json({ error: "Invalid CSP report." }, { status: 400 });
    }

    reports.forEach(recordCspReport);
    return new NextResponse(null, { status: 204 });
}
