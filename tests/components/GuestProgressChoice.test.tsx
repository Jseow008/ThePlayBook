import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestProgressChoice } from "@/components/reader/GuestProgressChoice";
import { progressKey } from "@/lib/local-user-storage";

const { state, saveReadingProgressMock } = vi.hoisted(() => ({
    state: { accountCompleted: ["first"] },
    saveReadingProgressMock: vi.fn(),
}));
const scrollIntoViewMock = vi.fn();

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
        scrollIntoViewMock.mockClear();
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollIntoViewMock,
        });
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

    afterEach(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
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

    it("brings an offscreen choice into view once after the reflection closes", async () => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
            top: 1000,
            bottom: 1200,
        } as DOMRect);
        const segments = ["first", "second"];
        const view = render(<GuestProgressChoice contentId="read-1" segmentIds={segments} reflectionPending />);
        expect(await screen.findByRole("button", { name: "Add browser progress" })).toBeInTheDocument();
        expect(scrollIntoViewMock).not.toHaveBeenCalled();

        view.rerender(<GuestProgressChoice contentId="read-1" segmentIds={segments} />);
        expect(scrollIntoViewMock).toHaveBeenCalledExactlyOnceWith({ block: "nearest", behavior: "smooth" });
        expect(screen.getByText(/Your account shows 1 of 2 sections/)).toBeInTheDocument();

        view.unmount();
        render(<GuestProgressChoice contentId="read-1" segmentIds={segments} />);
        expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    });

    it("does not move the page when the choice is already visible", async () => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
            top: 100,
            bottom: 400,
        } as DOMRect);
        render(<GuestProgressChoice contentId="read-1" segmentIds={["first", "second"]} />);
        expect(await screen.findByRole("button", { name: "Add browser progress" })).toBeInTheDocument();
        expect(scrollIntoViewMock).not.toHaveBeenCalled();
    });

    it("avoids smooth scrolling when reduced motion is preferred", async () => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
            top: 1000,
            bottom: 1200,
        } as DOMRect);
        vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
        render(<GuestProgressChoice contentId="read-1" segmentIds={["first", "second"]} />);
        expect(await screen.findByRole("button", { name: "Add browser progress" })).toBeInTheDocument();
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
    });
});
