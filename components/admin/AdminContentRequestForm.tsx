"use client";

import { useState } from "react";
import { updateContentRequest } from "@/app/admin/requests/actions";
import { ContentRequestPublishedPicker } from "@/components/admin/ContentRequestPublishedPicker";
import type { AdminContentRequest, PublishedContentOption } from "@/lib/server/content-requests";
import type { ContentRequestStatus } from "@/types/content-requests";

const STATUS_OPTIONS: Array<{ value: ContentRequestStatus; label: string }> = [
    { value: "pending", label: "Pending" },
    { value: "processing", label: "Processing" },
    { value: "published", label: "Published" },
    { value: "skipped", label: "Skipped" },
    { value: "failed", label: "Failed" },
];

export function AdminContentRequestForm({
    request,
    publishedContentOptions,
}: {
    request: AdminContentRequest;
    publishedContentOptions: PublishedContentOption[];
}) {
    const initialHidden = Boolean(request.hidden_at);
    const [status, setStatus] = useState<ContentRequestStatus>(request.status);
    const [hideRequest, setHideRequest] = useState(initialHidden ? "true" : "false");
    const shouldShowPublishedContent = status === "published" || status === "processing" || Boolean(request.published_content);
    const shouldShowHiddenReason = hideRequest === "true" || Boolean(request.hidden_reason);
    const adminNoteRequired = status === "skipped" || status === "failed";
    const adminNoteLabel = adminNoteRequired ? "Reason" : "Admin note";
    const adminNotePlaceholder = status === "failed"
        ? "What failed during generation or processing?"
        : status === "skipped"
        ? "Why is this request being skipped?"
        : "Internal note for sourcing, review, or production context.";

    return (
        <form action={updateContentRequest} className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-4">
            <input type="hidden" name="requestId" value={request.id} />

            <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground">
                Status
                <select
                    name="status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as ContentRequestStatus)}
                    className="h-10 w-full min-w-0 rounded-md border border-input bg-white px-3 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </label>

            {shouldShowPublishedContent ? (
                <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground">
                    Published content
                    <ContentRequestPublishedPicker
                        name="publishedContentId"
                        defaultValue={request.published_content?.id ?? ""}
                        options={publishedContentOptions}
                        required={status === "published"}
                    />
                </label>
            ) : null}

            <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground">
                Visibility
                <select
                    name="hideRequest"
                    value={hideRequest}
                    onChange={(event) => setHideRequest(event.target.value)}
                    className="h-10 w-full min-w-0 rounded-md border border-input bg-white px-3 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    <option value="false">Visible</option>
                    <option value="true">Hidden</option>
                </select>
            </label>

            {shouldShowHiddenReason ? (
                <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground">
                    Hidden reason
                    <input
                        name="hiddenReason"
                        defaultValue={request.hidden_reason ?? ""}
                        placeholder="Spam, duplicate cleanup, source issue..."
                        className="h-10 w-full min-w-0 rounded-md border border-input bg-white px-3 text-sm font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>
            ) : null}

            <details className="group min-w-0 rounded-lg border border-border bg-card/70 px-3 py-2" open={adminNoteRequired || Boolean(request.admin_note)}>
                <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:hidden">
                    {adminNoteLabel}
                    {!adminNoteRequired ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground group-open:hidden">Optional</span>
                    ) : null}
                </summary>
                <textarea
                    name="adminNote"
                    defaultValue={request.admin_note ?? ""}
                    placeholder={adminNotePlaceholder}
                    rows={3}
                    required={adminNoteRequired}
                    className="mt-2 min-h-20 w-full min-w-0 rounded-md border border-input bg-white px-3 py-2 text-sm font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
            </details>

            <button
                type="submit"
                className="focus-ring inline-flex h-10 w-full min-w-0 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
                Save changes
            </button>
        </form>
    );
}
