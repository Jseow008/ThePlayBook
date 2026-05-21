"use client";

import { useState } from "react";
import { updateContentRequest } from "@/app/admin/requests/actions";
import { ContentRequestPublishedPicker } from "@/components/admin/ContentRequestPublishedPicker";
import type { AdminContentRequest, PublishedContentOption } from "@/lib/server/content-requests";
import type { ContentRequestStatus } from "@/types/content-requests";

const STATUS_OPTIONS: Array<{ value: ContentRequestStatus; label: string }> = [
    { value: "requested", label: "Requested" },
    { value: "under_review", label: "Under Review" },
    { value: "in_progress", label: "In Progress" },
    { value: "published", label: "Published" },
    { value: "source_unavailable", label: "Source Unavailable" },
    { value: "archived", label: "Archived" },
];

export function AdminContentRequestForm({
    request,
    publishedContentOptions,
}: {
    request: AdminContentRequest;
    publishedContentOptions: PublishedContentOption[];
}) {
    const initialHidden = Boolean(request.hidden_at) || request.status === "archived";
    const [status, setStatus] = useState<ContentRequestStatus>(request.status);
    const [hideRequest, setHideRequest] = useState(initialHidden ? "true" : "false");
    const shouldShowPublishedContent = status === "published" || status === "in_progress" || Boolean(request.published_content);
    const shouldShowSourceNote = status === "source_unavailable" || Boolean(request.source_availability_note);
    const shouldShowHiddenReason = hideRequest === "true" || Boolean(request.hidden_reason);

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
                    />
                </label>
            ) : null}

            {shouldShowSourceNote ? (
                <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground">
                    Source availability note
                    <textarea
                        name="sourceAvailabilityNote"
                        defaultValue={request.source_availability_note ?? ""}
                        placeholder="Shown publicly when source is unavailable."
                        rows={3}
                        className="min-h-20 w-full min-w-0 rounded-md border border-input bg-white px-3 py-2 text-sm font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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

            <details className="group min-w-0 rounded-lg border border-border bg-card/70 px-3 py-2" open={Boolean(request.admin_note)}>
                <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:hidden">
                    Admin note
                    <span className="ml-2 text-xs font-normal text-muted-foreground group-open:hidden">Optional</span>
                </summary>
                <textarea
                    name="adminNote"
                    defaultValue={request.admin_note ?? ""}
                    placeholder="Internal note for sourcing, review, or production context."
                    rows={3}
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
