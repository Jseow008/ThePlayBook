import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ContentContributors } from "@/components/admin/ContentContributors";
import { saveContentContributors } from "@/app/admin/content/[id]/edit/contributors";

vi.mock("@/app/admin/content/[id]/edit/contributors", () => ({
    saveContentContributors: vi.fn(async () => ({ status: "saved", message: "Contributors saved." })),
}));

it("edits a panel and removes its designated speaker without losing the other credits", async () => {
    render(<ContentContributors contentId="content" initial={[
        { id: "host", name: "Nora", role: "host", is_default_speaker: false },
        { id: "guest-one", name: "Kai", role: "guest", is_default_speaker: true },
        { id: "guest-two", name: "Amina", role: "guest", is_default_speaker: false },
    ]} />);
    expect(screen.getByLabelText("Default chat speaker")).toHaveValue("guest-one");
    fireEvent.click(screen.getByRole("button", { name: "Remove contributor 2" }));
    expect(screen.getByLabelText("Default chat speaker")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Add contributor" }));
    fireEvent.change(screen.getByLabelText("Contributor 3"), { target: { value: "Ravi" } });
    fireEvent.change(screen.getByLabelText("Role for contributor 3"), { target: { value: "guest" } });
    fireEvent.click(screen.getByRole("button", { name: "Save contributors" }));
    await waitFor(() => expect(saveContentContributors).toHaveBeenCalledOnce());
    const submitted = vi.mocked(saveContentContributors).mock.lastCall?.[2].get("contributors");
    expect(JSON.parse(String(submitted))).toEqual([
        { name: "Nora", role: "host", is_default_speaker: false },
        { name: "Amina", role: "guest", is_default_speaker: false },
        { name: "Ravi", role: "guest", is_default_speaker: false },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent("Contributors saved.");
});
