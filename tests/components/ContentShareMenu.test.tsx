import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentShareMenu } from "@/components/ui/ContentShareMenu";

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

function mockClipboard() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
    });
    return writeText;
}

function mockSuccessfulImageFetch() {
    const blob = new Blob(["png"], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(blob, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function renderMenu() {
    render(
        <ContentShareMenu
            contentId={contentId}
            title="Can't Hurt Me"
            text="Read Can't Hurt Me on Netflux"
            url="https://netflux.test/read/cant-hurt-me"
        />
    );

    fireEvent.click(screen.getByRole("button", { name: "Share this content" }));
}

describe("ContentShareMenu", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("opens a unified share menu with link and story actions", () => {
        renderMenu();

        expect(screen.getByRole("menu", { name: "Share" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: /Send link/ })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: /Copy link/ })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: /Share as Story/ })).toBeInTheDocument();
    });

    it("uses native sharing for the send link action", async () => {
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

        renderMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /Send link/ }));

        await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
        expect(share).toHaveBeenCalledWith({
            title: "Can't Hurt Me",
            text: "Read Can't Hurt Me on Netflux",
            url: "https://netflux.test/read/cant-hurt-me",
        });
    });

    it("copies the link from the copy link action", async () => {
        const writeText = mockClipboard();

        renderMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /Copy link/ }));

        await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://netflux.test/read/cant-hurt-me"));
    });

    it("downloads a story image when file sharing is unavailable", async () => {
        const fetchMock = mockSuccessfulImageFetch();
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

        renderMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /Share as Story/ }));

        await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(`/api/og/content/${contentId}/story`),
            { headers: { Accept: "image/png" } }
        );
        expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(writeText).toHaveBeenCalledWith("https://netflux.test/read/cant-hurt-me");

        click.mockRestore();
    });
});
