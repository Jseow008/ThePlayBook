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
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    const response = {
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(blob),
    } as Pick<Response, "ok" | "status" | "blob">;
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function renderMenu(destination: "Preview" | "Read" = "Read") {
    render(
        <ContentShareMenu
            contentId={contentId}
            title="Can't Hurt Me"
            text="Read Can't Hurt Me on Netflux"
            destination={destination}
            url={destination === "Read" ? "https://netflux.test/read/cant-hurt-me" : undefined}
            path={destination === "Preview" ? `/preview/${contentId}` : undefined}
        />
    );

    fireEvent.click(screen.getByRole("button", { name: "Share this content" }));
}

async function renderPreparedMenu() {
    renderMenu();

    const shareImage = await screen.findByRole("menuitem", { name: "Share image" });
    await waitFor(() => expect(shareImage).toBeEnabled());
    return shareImage;
}

describe("ContentShareMenu", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
        Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
        mockSuccessfulImageFetch();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("prepares the image when the share menu opens", async () => {
        renderMenu();

        expect(screen.getByRole("menu", { name: "Share" })).toHaveAccessibleDescription("Link opens Read");
        expect(screen.queryByRole("menuitem", { name: /Send link/ })).not.toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: /Copy link/ })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "Preparing image..." })).toBeDisabled();

        await screen.findByRole("menuitem", { name: "Share image" });
    });

    it("labels and copies a Preview link without preparing an image", async () => {
        const writeText = mockClipboard();
        const fetchMock = mockSuccessfulImageFetch();
        const share = vi.fn();
        Object.defineProperty(navigator, "share", { configurable: true, value: share });
        Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });

        renderMenu("Preview");

        expect(screen.getByRole("menu", { name: "Share" })).toHaveAccessibleDescription("Link opens Preview");
        expect(screen.getAllByRole("menuitem")).toHaveLength(1);
        expect(writeText).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }));

        await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/preview/${contentId}`));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(share).not.toHaveBeenCalled();
    });

    it("leaves Copy link available after system sharing fails", async () => {
        const writeText = mockClipboard();
        const share = vi.fn().mockRejectedValue(new Error("Share failed"));
        Object.defineProperty(navigator, "share", { configurable: true, value: share });
        Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });

        renderMenu("Preview");
        fireEvent.click(screen.getByRole("menuitem", { name: "Send link" }));

        await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
        expect(screen.getByRole("menuitem", { name: "Copy link" })).toBeInTheDocument();
        expect(writeText).not.toHaveBeenCalled();
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

        await renderPreparedMenu();
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

        await renderPreparedMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /Copy link/ }));

        await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://netflux.test/read/cant-hurt-me"));
    });

    it("shares image files with a file-only payload when supported", async () => {
        mockSuccessfulImageFetch();
        const writeText = mockClipboard();
        const share = vi.fn().mockResolvedValue(undefined);
        const canShare = vi.fn((shareData: ShareData) => Boolean(shareData.files?.length) && !shareData.text);

        Object.defineProperty(navigator, "share", {
            configurable: true,
            value: share,
        });
        Object.defineProperty(navigator, "canShare", {
            configurable: true,
            value: canShare,
        });

        const shareImage = await renderPreparedMenu();
        fireEvent.click(shareImage);

        await waitFor(() => expect(share).toHaveBeenCalledTimes(1));

        expect(canShare).toHaveBeenCalledWith({
            files: expect.arrayContaining([expect.any(File)]),
        });
        expect(share).toHaveBeenCalledWith({
            files: expect.arrayContaining([expect.any(File)]),
        });
        expect(writeText).toHaveBeenCalledWith("https://netflux.test/read/cant-hurt-me");
        expect(share.mock.invocationCallOrder[0]).toBeLessThan(writeText.mock.invocationCallOrder[0]);
    });

    it("downloads an image when file sharing is unavailable", async () => {
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

        const shareImage = await renderPreparedMenu();
        fireEvent.click(shareImage);

        await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(`/api/og/content/${contentId}/story`),
            { headers: { Accept: "image/jpeg" } }
        );
        expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(writeText).toHaveBeenCalledWith("https://netflux.test/read/cant-hurt-me");

        click.mockRestore();
    });

    it("does not download when native sharing rejects", async () => {
        const share = vi.fn().mockRejectedValue(Object.assign(new Error("Not allowed"), { name: "NotAllowedError" }));
        const createObjectURL = vi.fn();
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

        Object.defineProperty(navigator, "share", {
            configurable: true,
            value: share,
        });
        Object.defineProperty(navigator, "canShare", {
            configurable: true,
            value: vi.fn().mockReturnValue(true),
        });
        Object.defineProperty(URL, "createObjectURL", {
            configurable: true,
            value: createObjectURL,
        });

        const shareImage = await renderPreparedMenu();
        fireEvent.click(shareImage);

        await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
        expect(createObjectURL).not.toHaveBeenCalled();
        expect(click).not.toHaveBeenCalled();

        click.mockRestore();
    });
});
