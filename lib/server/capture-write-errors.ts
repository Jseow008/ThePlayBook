import { NextResponse } from "next/server";

/** Database admission also applies to direct Data API writes. Preserve its status in HTTP routes. */
export function captureWriteFailure(error: { code?: string } | null) {
    if (error?.code === "PT409") return NextResponse.json({ error: {
        code: "CONFLICT", message: "This summary changed. Your note has not been saved. Keep your text, reload the summary, and review it before saving.",
    } }, { status: 409, headers: { "Cache-Control": "no-store" } });
    if (error?.code === "PT429") return NextResponse.json({ error: {
        code: "RATE_LIMITED", message: "Too many changes. Please wait a minute before trying again.",
    } }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
    if (error?.code === "PT403") return NextResponse.json({ error: {
        code: "FORBIDDEN", message: "Maximum of 50 highlights per item reached.",
    } }, { status: 403 });
    return null;
}
