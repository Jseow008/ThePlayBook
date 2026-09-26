import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveToLibraryButton } from "@/components/ui/SaveToLibraryButton";

const { toggle, success } = vi.hoisted(() => ({ toggle: vi.fn(), success: vi.fn() }));
vi.mock("@/hooks/useReadingProgress", () => ({ useReadingProgress: () => ({
    isInMyList: () => false, isLoaded: true, toggleMyList: toggle,
}) }));
vi.mock("sonner", () => ({ toast: { success } }));

describe("acknowledged library save feedback", () => {
    beforeEach(() => { toggle.mockReset(); success.mockReset(); });
    it("waits for server acknowledgement before announcing success", async () => {
        let acknowledge!: (value: boolean) => void;
        toggle.mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
        render(<SaveToLibraryButton contentId="item" contentTitle="Example" />);
        fireEvent.click(screen.getByRole("button", { name: "Save Example to Library" }));
        expect(success).not.toHaveBeenCalled();
        await act(async () => acknowledge(true));
        expect(success).toHaveBeenCalledWith("Saved to Library");
    });
    it("does not announce success for a rejected or unconfirmed change", async () => {
        toggle.mockResolvedValue(false);
        render(<SaveToLibraryButton contentId="item" contentTitle="Example" />);
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Example to Library" })));
        expect(success).not.toHaveBeenCalled();
    });
});
