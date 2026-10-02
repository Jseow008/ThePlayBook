import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuestProgressChoice } from "@/components/reader/GuestProgressChoice";
import { progressKey } from "@/lib/local-user-storage";

const { state, saveReadingProgressMock } = vi.hoisted(() => ({
    state: { accountCompleted: ["first"] },
    saveReadingProgressMock: vi.fn(),
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => ({
        user: { id: "reader-1" },
        isLoaded: true,
        hydrationStatus: "ready",
        getProgress: () => ({
            itemId: "read-1",
            completed: state.accountCompleted,
            lastSegmentIndex: 0,
            lastReadAt: "2026-10-01T00:00:00.000Z",
            isCompleted: false,
            totalSegments: 2,
        }),
        saveReadingProgress: saveReadingProgressMock,
    }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("GuestProgressChoice", () => {
    beforeEach(() => {
        const data = new Map<string, string>();
        Object.defineProperty(window, "localStorage", { configurable: true, value: {
            getItem: (key: string) => data.get(key) ?? null,
            setItem: (key: string, value: string) => { data.set(key, value); },
            removeItem: (key: string) => { data.delete(key); },
            clear: () => { data.clear(); },
        } });
        const decisions = new Map<string, string>();
        Object.defineProperty(window, "sessionStorage", { configurable: true, value: {
            getItem: (key: string) => decisions.get(key) ?? null,
            setItem: (key: string, value: string) => { decisions.set(key, value); },
            removeItem: (key: string) => { decisions.delete(key); },
            clear: () => { decisions.clear(); },
        } });
        saveReadingProgressMock.mockClear();
        state.accountCompleted = ["first"];
        localStorage.setItem(progressKey("guest", "read-1"), JSON.stringify({
            itemId: "read-1",
            completed: ["first", "second"],
            lastSegmentIndex: 1,
            lastReadAt: "2026-10-02T00:00:00.000Z",
            isCompleted: true,
        }));
    });

    it("requires a choice before applying completed browser progress", async () => {
        render(<GuestProgressChoice contentId="read-1" segmentIds={["first", "second"]} />);
        const apply = await screen.findByRole("button", { name: "Add browser progress" });
        expect(saveReadingProgressMock).not.toHaveBeenCalled();
        fireEvent.click(apply);
        expect(saveReadingProgressMock).toHaveBeenCalledWith("read-1", expect.objectContaining({
            completed: ["first", "second"],
            isCompleted: true,
        }));
    });

    it("keeps the existing account record when declined", async () => {
        const view = render(<GuestProgressChoice contentId="read-1" segmentIds={["first", "second"]} />);
        fireEvent.click(await screen.findByRole("button", { name: "Keep account progress for now" }));
        expect(saveReadingProgressMock).not.toHaveBeenCalled();
        expect(sessionStorage.getItem("netflux_guest_progress_choice:v1:reader-1:read-1"))
            .toBe("2026-10-02T00:00:00.000Z");
        view.unmount();
        render(<GuestProgressChoice contentId="read-1" segmentIds={["first", "second"]} />);
        expect(screen.queryByRole("button", { name: "Add browser progress" })).not.toBeInTheDocument();
    });

    it("does not offer browser progress when the account is already complete", () => {
        state.accountCompleted = ["first", "second"];
        render(<GuestProgressChoice contentId="read-1" segmentIds={["first", "second"]} />);
        expect(screen.queryByRole("button", { name: "Add browser progress" })).not.toBeInTheDocument();
    });
});
