import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminRequestsPage from "@/app/admin/requests/page";
import { getContentRequestNotificationBacklogStats } from "@/lib/server/content-request-notifications";

vi.mock("@/lib/server/content-request-notifications", () => ({ getContentRequestNotificationBacklogStats: vi.fn() }));
vi.mock("@/lib/server/content-requests", () => ({ fetchAdminContentRequests: async () => [], fetchPublishedContentOptions: async () => [] }));
vi.mock("@/components/admin/AdminContentRequestForm", () => ({ AdminContentRequestForm: () => null }));
const empty = { missing: 0, queued: 0, queuedOlderThanOneHour: 0, processing: 0, staleProcessing: 0, failed: 0, sentLast24Hours: 0 };
beforeEach(() => vi.mocked(getContentRequestNotificationBacklogStats).mockResolvedValue(empty));
afterEach(cleanup);

it("shows missing enqueue as needing attention even when every queue counter is zero", async () => {
    vi.mocked(getContentRequestNotificationBacklogStats).mockResolvedValue({ ...empty, missing: 2 });
    render(await AdminRequestsPage({}));
    expect(screen.getByText("Needs attention")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Not queued: 2");
    expect(screen.getByText(/Save the affected requests again/)).toBeVisible();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
});

it("retains healthy and draining states when no eligible notifications are missing", async () => {
    render(await AdminRequestsPage({}));
    expect(screen.getByText("Healthy")).toBeVisible();
    cleanup();
    vi.mocked(getContentRequestNotificationBacklogStats).mockResolvedValue({ ...empty, queued: 1 });
    render(await AdminRequestsPage({}));
    expect(screen.getByText("Draining")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
