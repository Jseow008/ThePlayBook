import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryShareButton } from "@/components/ui/StoryShareButton";

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("@/lib/analytics", () => ({
    captureAnalyticsEvent: vi.fn(),
}));

const contentId = "11111111-1111-4111-8111-111111111111";

function mockSuccessfulImageFetch() {
    const blob = new Blob(["png"], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(blob, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function mockClipboard() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
    });
    return writeText;
}

describe("StoryShareButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    async function waitForPreparedButton() {
        const button = screen.getByRole("button", { name: "Share story image" });
        await waitFor(() => expect(button).toBeEnabled());
        return button;
    }

    it("shares the generated story image as a file when the browser supports it", async () => {
        const fetchMock = mockSuccessfulImageFetch();
        const writeText = mockClipboard();
        const share = vi.fn().mockResolvedValue(undefined);
        const canShare = vi.fn().mockReturnValue(true);

        Object.defineProperty(navigator, "share", {
            configurable: true,
            value: share,
        });
        Object.defineProperty(navigator, "canShare", {
            configurable: true,
            value: canShare,
        });

        render(
            <StoryShareButton
                contentId={contentId}
                title="Can't Hurt Me"
                url="https://netflux.test/read/cant-hurt-me"
            />
        );

        fireEvent.click(await waitForPreparedButton());

        await waitFor(() => expect(share).toHaveBeenCalledTimes(1));

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(`/api/og/content/${contentId}/story`),
            { headers: { Accept: "image/png" } }
        );
        expect(writeText).toHaveBeenCalledWith("https://netflux.test/read/cant-hurt-me");
        expect(canShare).toHaveBeenCalledWith(expect.objectContaining({
            files: expect.arrayContaining([expect.any(File)]),
        }));
        expect(share).toHaveBeenCalledWith({
            files: expect.arrayContaining([expect.any(File)]),
        });
    });

    it("downloads the generated story image when file sharing is unavailable", async () => {
        mockSuccessfulImageFetch();
        const writeText = mockClipboard();
        const createObjectURL = vi.fn().mockReturnValue("blob:story-image");
        const revokeObjectURL = vi.fn();
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

        Object.defineProperty(navigator, "canShare", {
            configurable: true,
            value: vi.fn().mockReturnValue(false),
        });
        Object.defineProperty(URL, "createObjectURL", {
            configurable: true,
            value: createObjectURL,
        });
        Object.defineProperty(URL, "revokeObjectURL", {
            configurable: true,
            value: revokeObjectURL,
        });

        render(
            <StoryShareButton
                contentId={contentId}
                title="Can't Hurt Me"
                url="https://netflux.test/read/cant-hurt-me"
            />
        );

        fireEvent.click(await waitForPreparedButton());

        await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

        expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(writeText).toHaveBeenCalledWith("https://netflux.test/read/cant-hurt-me");

        click.mockRestore();
    });

    it("does not show completed state when the native share sheet is cancelled", async () => {
        mockSuccessfulImageFetch();
        mockClipboard();
        const share = vi.fn().mockRejectedValue(Object.assign(new Error("Cancelled"), { name: "AbortError" }));

        Object.defineProperty(navigator, "share", {
            configurable: true,
            value: share,
        });
        Object.defineProperty(navigator, "canShare", {
            configurable: true,
            value: vi.fn().mockReturnValue(true),
        });

        render(
            <StoryShareButton
                contentId={contentId}
                title="Can't Hurt Me"
                url="https://netflux.test/read/cant-hurt-me"
            />
        );

        const button = await waitForPreparedButton();
        fireEvent.click(button);

        await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(button).not.toBeDisabled());

        expect(button.querySelector("svg.text-primary")).not.toBeInTheDocument();
    });
});
