"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateContentRequest } from "@/app/admin/requests/actions";
import { ContentRequestPublishedPicker } from "@/components/admin/ContentRequestPublishedPicker";
import type { AdminContentRequest, PublishedContentOption } from "@/lib/server/content-requests";
import type { UpdateContentRequestState } from "@/app/admin/requests/actions";
import type { ContentRequestStatus } from "@/types/content-requests";

const STATUS_OPTIONS: Array<{ value: ContentRequestStatus; label: string }> = [
    { value: "pending", label: "Pending" },
    { value: "processing", label: "Processing" },
    { value: "published", label: "Published" },
    { value: "skipped", label: "Skipped" },
    { value: "failed", label: "Failed" },
];

const INITIAL_ACTION_STATE: UpdateContentRequestState = {
    status: "idle",
    message: null,
};

function SaveButton() {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="focus-ring inline-flex h-10 w-full min-w-0 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-500"
        >
            {pending ? "Saving..." : "Save changes"}
        </button>
    );
}

export function AdminContentRequestForm({
    request,
    publishedContentOptions,
}: {
    request: AdminContentRequest;
    publishedContentOptions: PublishedContentOption[];
}) {
    const initialHidden = Boolean(request.hidden_at);
    const [actionState, formAction] = useActionState(updateContentRequest, INITIAL_ACTION_STATE);
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

    useEffect(() => {
        setStatus(request.status);
    }, [request.id, request.status, request.updated_at]);

    useEffect(() => {
        setHideRequest(Boolean(request.hidden_at) ? "true" : "false");
    }, [request.id, request.hidden_at, request.updated_at]);

    return (
        <form action={formAction} noValidate className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-4">
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
                {actionState.fieldErrors?.status ? (
                    <span className="text-xs font-normal text-red-700">{actionState.fieldErrors.status}</span>
                ) : null}
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
                    {actionState.fieldErrors?.publishedContentId ? (
                        <span className="text-xs font-normal text-red-700">{actionState.fieldErrors.publishedContentId}</span>
                    ) : null}
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
                    {actionState.fieldErrors?.hiddenReason ? (
                        <span className="text-xs font-normal text-red-700">{actionState.fieldErrors.hiddenReason}</span>
                    ) : null}
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
                {actionState.fieldErrors?.adminNote ? (
                    <p className="mt-1 text-xs font-normal text-red-700">{actionState.fieldErrors.adminNote}</p>
                ) : null}
            </details>

            {actionState.message ? (
                <p
                    role={actionState.status === "error" ? "alert" : "status"}
                    className={`rounded-md px-3 py-2 text-sm ${
                        actionState.status === "error"
                            ? "border border-red-200 bg-red-50 text-red-700"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                >
                    {actionState.message}
                </p>
            ) : null}

            <SaveButton />
        </form>
    );
}
