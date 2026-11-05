import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentVersionActions } from "@/components/admin/ContentVersionActions";
const push = vi.fn(); const refresh = vi.fn();
vi.mock("next/navigation", () => ({useRouter: () => ({ push,refresh })}));
const review = {source:{id:"old",title:"Original",updated_at:"old-time"},replacement:{id:"new",title:"Rewrite",updated_at:"new-time"},preserved:{libraryRecords:1,highlights:2,reflections:3}};
const response = (data: unknown,ok=true) => ({ok,json:async () => data});
describe("updated version review", () => {
    beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn(); });
    it("creates from the saved copy and opens its separate editor", async () => {
        vi.mocked(fetch).mockResolvedValue(response({draftId:"new"}) as Response);
        render(<ContentVersionActions mode="create" contentId="old" updatedAt="old-time" />);
        expect(screen.getByText(/Unsaved changes on this page are not copied/)).toBeVisible();
        fireEvent.click(screen.getByRole("button",{name:"Create updated version"}));
        await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content/new/edit"));
        expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({sourceUpdatedAt:"old-time"});
    });
    it("requires loaded preservation review and explicit publish with both stamps", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(response(review) as Response).mockResolvedValueOnce(response({success:true}) as Response);
        render(<ContentVersionActions mode="publish" contentId="new" />);
        expect(screen.getByRole("button",{name:"Publish updated version"})).toBeDisabled();
        await screen.findByText(/Preserve 1 library records, 2 highlights and 3 reflections/);
        expect(fetch).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole("button",{name:"Publish updated version"}));
        await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content"));
        expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual({replacementId:"new",sourceUpdatedAt:"old-time",replacementUpdatedAt:"new-time"});
    });
    it("does not claim success or allow a stale review to be reused", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(response(review) as Response).mockResolvedValueOnce(response({error:{message:"Summary changed"}},false) as Response);
        render(<ContentVersionActions mode="publish" contentId="new" />);
        await screen.findByText(/Preserve 1 library/);
        fireEvent.click(screen.getByRole("button",{name:"Publish updated version"}));
        expect(await screen.findByRole("alert")).toHaveTextContent("Summary changed");
        expect(push).not.toHaveBeenCalled();
        expect(screen.getByRole("button",{name:"Publish updated version"})).toBeDisabled();
    });
});
