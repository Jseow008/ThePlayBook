import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveToLibraryButton } from "@/components/ui/SaveToLibraryButton";

const { toggle, success, isInMyList } = vi.hoisted(() => ({
    toggle: vi.fn(), success: vi.fn(), isInMyList: vi.fn(),
}));
vi.mock("@/hooks/useReadingProgress", () => ({ useReadingProgress: () => ({
    isInMyList, isLoaded: true, toggleMyList: toggle,
}) }));
vi.mock("sonner", () => ({ toast: { success } }));

describe("acknowledged library save feedback", () => {
    beforeEach(() => {
        toggle.mockReset();
        success.mockReset();
        isInMyList.mockReset().mockReturnValue(false);
    });
    it("waits for server acknowledgement before announcing success", async () => {
        let acknowledge!: (value: boolean) => void;
        toggle.mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
        render(<SaveToLibraryButton contentId="item" contentTitle="Example" />);
        fireEvent.click(screen.getByRole("button", { name: "Save Example to Library" }));
        expect(success).not.toHaveBeenCalled();
        await act(async () => acknowledge(true));
        expect(success).toHaveBeenCalledWith("Saved to Library");
    });
    it("labels an existing bookmark and its removal as Saved", async () => {
        isInMyList.mockReturnValue(true);
        toggle.mockResolvedValue(true);
        render(<SaveToLibraryButton contentId="item" contentTitle="Example" />);

        const button = screen.getByRole("button", { name: "Remove Example from Saved" });
        expect(button).toHaveAttribute("title", "Remove from Saved");
        await act(async () => fireEvent.click(button));
        expect(toggle).toHaveBeenCalledWith("item");
        expect(success).toHaveBeenCalledWith("Removed from Saved");
    });
    it("does not announce success for a rejected or unconfirmed change", async () => {
        toggle.mockResolvedValue(false);
        render(<SaveToLibraryButton contentId="item" contentTitle="Example" />);
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Example to Library" })));
        expect(success).not.toHaveBeenCalled();
    });
});
