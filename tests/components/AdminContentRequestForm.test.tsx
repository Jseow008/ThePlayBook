import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminContentRequestForm } from "@/components/admin/AdminContentRequestForm";
import { updateContentRequest } from "@/app/admin/requests/actions";
import type { AdminContentRequest } from "@/lib/server/content-requests";

vi.mock("@/app/admin/requests/actions", () => ({ updateContentRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("retains the published status and destination after a queue warning so retry cannot unpublish the request", async () => {
    const submissions: Array<Record<string, FormDataEntryValue>> = [];
    vi.mocked(updateContentRequest).mockImplementation(async (_previous, data) => {
        submissions.push(Object.fromEntries(data));
        return { status: "success", message: "Request saved.", ...(submissions.length === 1
            ? { notificationWarning: "Request saved, but notification emails could not be queued. Save changes again to retry." }
            : {}) };
    });
    const request: AdminContentRequest = {
        id: "00000000-0000-4000-8000-000000000001", title: "Synthetic request", author: null, source_url: null,
        content_type: "book", thumbnail_url: null, status: "pending", source_availability_note: null, vote_count: 1,
        created_at: "2026-11-15", updated_at: "2026-11-15", published_content: null,
        hidden_at: null, hidden_reason: null, admin_note: null,
    };
    const { container } = render(<AdminContentRequestForm request={request} publishedContentOptions={[
        { id: "synthetic-content", title: "Synthetic published summary", author: null, type: "article" },
    ]} />);
    const status = container.querySelector<HTMLSelectElement>('select[name="status"]')!;
    fireEvent.change(status, { target: { value: "published" } });
    const destination = container.querySelector<HTMLSelectElement>('select[name="publishedContentId"]')!;
    fireEvent.change(destination, { target: { value: "synthetic-content" } });
    fireEvent.change(container.querySelector('textarea[name="adminNote"]')!, { target: { value: "Synthetic admin note\nSecond line" } });
    fireEvent.submit(container.querySelector("form")!);
    await screen.findByRole("alert");
    expect(status).toHaveValue("published");
    expect(destination).toHaveValue("synthetic-content");
    expect(container.querySelector('textarea[name="adminNote"]')).toHaveValue("Synthetic admin note\nSecond line");
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(submissions).toHaveLength(2));
    expect(submissions[1]).toMatchObject({ status: "published", publishedContentId: "synthetic-content", adminNote: "Synthetic admin note\nSecond line" });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});
