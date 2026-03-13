import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResilientImage } from "@/components/ui/ResilientImage";

vi.mock("next/image", () => ({
    default: ({
        alt,
        fill,
        priority,
        unoptimized,
        ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & {
        fill?: boolean;
        priority?: boolean;
        unoptimized?: boolean;
    }) => {
        void fill;
        void priority;
        void unoptimized;

        return (
            <img
                alt={alt}
                data-unoptimized={String(Boolean(unoptimized))}
                {...props}
            />
        );
    },
}));

describe("ResilientImage", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("switches to a direct retry and strips sensitive URL parts from telemetry", async () => {
        const sendBeacon = vi.fn(() => true);
        Object.defineProperty(window.navigator, "sendBeacon", {
            configurable: true,
            value: sendBeacon,
        });

        render(
            <ResilientImage
                alt="Remote cover"
                height={320}
                src="https://example.com/covers/test.jpg?token=secret#fragment"
                surface="content-card"
                width={240}
            />
        );

        const image = screen.getByAltText("Remote cover");
        expect(image).toHaveAttribute("data-unoptimized", "false");

        fireEvent.error(image);

        const retried = screen.getByAltText("Remote cover");
        expect(retried).toHaveAttribute("data-unoptimized", "true");
        expect(sendBeacon).toHaveBeenCalledTimes(1);

        const [url, body] = sendBeacon.mock.calls[0] as [string, Blob];
        expect(url).toBe("/api/monitor/image-fallback");

        const payload = JSON.parse(await body.text()) as Record<string, string | null>;
        expect(payload).toMatchObject({
            host: "example.com",
            pathname: "/covers/test.jpg",
            src_type: "remote",
            stage: "direct_retry",
            surface: "content-card",
        });
    });

    it("renders the supplied fallback after the direct retry also fails", async () => {
        const sendBeacon = vi.fn(() => true);
        Object.defineProperty(window.navigator, "sendBeacon", {
            configurable: true,
            value: sendBeacon,
        });

        render(
            <ResilientImage
                alt="Remote cover"
                fallback={<div data-testid="image-fallback">Fallback</div>}
                height={320}
                src="https://example.com/covers/final-failure.jpg"
                surface="content-card"
                width={240}
            />
        );

        fireEvent.error(screen.getByAltText("Remote cover"));

        const retried = screen.getByAltText("Remote cover");
        expect(retried).toHaveAttribute("data-unoptimized", "true");

        fireEvent.error(retried);

        expect(screen.getByTestId("image-fallback")).toBeInTheDocument();
        expect(screen.queryByAltText("Remote cover")).not.toBeInTheDocument();
        await waitFor(() => {
            expect(sendBeacon).toHaveBeenCalledTimes(2);
        });

        const [, finalFailureBody] = sendBeacon.mock.calls[1] as [string, Blob];
        const payload = JSON.parse(await finalFailureBody.text()) as Record<string, string | null>;

        expect(payload).toMatchObject({
            stage: "final_failure",
            surface: "content-card",
        });
    });

    it("resets to optimized mode when the source changes", () => {
        const { rerender } = render(
            <ResilientImage
                alt="Local cover"
                fallback={<div data-testid="image-fallback">Fallback</div>}
                height={320}
                src="/images/hero-section.webp"
                surface="content-card"
                width={240}
            />
        );

        fireEvent.error(screen.getByAltText("Local cover"));
        fireEvent.error(screen.getByAltText("Local cover"));

        expect(screen.getByTestId("image-fallback")).toBeInTheDocument();

        rerender(
            <ResilientImage
                alt="Local cover"
                fallback={<div data-testid="image-fallback">Fallback</div>}
                height={320}
                src="/images/notes.webp"
                surface="content-card"
                width={240}
            />
        );

        expect(screen.getByAltText("Local cover")).toHaveAttribute("data-unoptimized", "false");
    });
});
