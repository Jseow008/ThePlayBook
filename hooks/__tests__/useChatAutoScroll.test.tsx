import { fireEvent, render, screen } from "@testing-library/react";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";
import { vi } from "vitest";

function setScrollMetrics(
    element: HTMLElement,
    metrics: {
        scrollHeight: number;
        clientHeight: number;
        scrollTop: number;
    }
) {
    Object.defineProperty(element, "scrollHeight", {
        configurable: true,
        value: metrics.scrollHeight,
    });
    Object.defineProperty(element, "clientHeight", {
        configurable: true,
        value: metrics.clientHeight,
    });
    Object.defineProperty(element, "scrollTop", {
        configurable: true,
        writable: true,
        value: metrics.scrollTop,
    });
}

function ScrollHarness({
    messageCount,
    lastMessageId,
    lastMessageTextLength,
    status,
}: {
    messageCount: number;
    lastMessageId?: string;
    lastMessageTextLength: number;
    status: string;
}) {
    const { containerRef, endRef } = useChatAutoScroll<HTMLDivElement>({
        messageCount,
        lastMessageId,
        lastMessageTextLength,
        status,
    });

    return (
        <div ref={containerRef} data-testid="scroll-region">
            <div style={{ height: 1200 }} />
            <div ref={endRef} />
        </div>
    );
}

function DelayedMountHarness({
    show,
    messageCount,
    lastMessageId,
    lastMessageTextLength,
    status,
}: {
    show: boolean;
    messageCount: number;
    lastMessageId?: string;
    lastMessageTextLength: number;
    status: string;
}) {
    const { containerRef } = useChatAutoScroll<HTMLDivElement>({
        messageCount,
        lastMessageId,
        lastMessageTextLength,
        status,
    });

    if (!show) {
        return null;
    }

    return <div ref={containerRef} data-testid="delayed-scroll-region" />;
}

describe("useChatAutoScroll", () => {
    const scrollToMock = vi.fn();

    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", {
            configurable: true,
            value: scrollToMock,
        });
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("follows the stream while the user stays at the bottom", () => {
        const { rerender } = render(
            <ScrollHarness
                messageCount={0}
                lastMessageTextLength={0}
                status="ready"
            />
        );

        const scrollRegion = screen.getByTestId("scroll-region");
        setScrollMetrics(scrollRegion, {
            scrollHeight: 1200,
            clientHeight: 400,
            scrollTop: 800,
        });
        fireEvent.scroll(scrollRegion);

        rerender(
            <ScrollHarness
                messageCount={1}
                lastMessageId="m1"
                lastMessageTextLength={20}
                status="streaming"
            />
        );

        expect(scrollToMock).toHaveBeenCalledWith({ top: 1200, behavior: "auto" });
    });

    it("stops following immediately when the user scrolls upward", () => {
        const { rerender } = render(
            <ScrollHarness
                messageCount={1}
                lastMessageId="m1"
                lastMessageTextLength={20}
                status="streaming"
            />
        );

        const scrollRegion = screen.getByTestId("scroll-region");
        setScrollMetrics(scrollRegion, {
            scrollHeight: 1200,
            clientHeight: 400,
            scrollTop: 760,
        });
        fireEvent.scroll(scrollRegion);

        scrollToMock.mockClear();

        rerender(
            <ScrollHarness
                messageCount={1}
                lastMessageId="m1"
                lastMessageTextLength={80}
                status="streaming"
            />
        );

        expect(scrollToMock).not.toHaveBeenCalled();
    });

    it("stops following after a touch gesture even before the scroll position visibly changes", () => {
        const { rerender } = render(
            <ScrollHarness
                messageCount={1}
                lastMessageId="m1"
                lastMessageTextLength={20}
                status="streaming"
            />
        );

        const scrollRegion = screen.getByTestId("scroll-region");
        setScrollMetrics(scrollRegion, {
            scrollHeight: 577,
            clientHeight: 445,
            scrollTop: 132,
        });
        fireEvent.scroll(scrollRegion);

        scrollToMock.mockClear();

        fireEvent.touchStart(scrollRegion, {
            touches: [{ clientY: 300 }],
        });
        fireEvent.touchMove(scrollRegion, {
            touches: [{ clientY: 220 }],
        });
        fireEvent.touchEnd(scrollRegion);

        rerender(
            <ScrollHarness
                messageCount={1}
                lastMessageId="m1"
                lastMessageTextLength={80}
                status="streaming"
            />
        );

        expect(scrollToMock).not.toHaveBeenCalled();
    });

    it("attaches interaction listeners when the scroll container mounts after the first render", () => {
        const { rerender } = render(
            <DelayedMountHarness
                show={false}
                messageCount={1}
                lastMessageId="m1"
                lastMessageTextLength={20}
                status="streaming"
            />
        );

        rerender(
            <DelayedMountHarness
                show
                messageCount={1}
                lastMessageId="m1"
                lastMessageTextLength={20}
                status="streaming"
            />
        );

        const scrollRegion = screen.getByTestId("delayed-scroll-region");
        setScrollMetrics(scrollRegion, {
            scrollHeight: 1170,
            clientHeight: 647,
            scrollTop: 449,
        });
        fireEvent.scroll(scrollRegion);

        scrollToMock.mockClear();

        fireEvent.touchStart(scrollRegion, {
            touches: [{ clientY: 500 }],
        });
        fireEvent.touchMove(scrollRegion, {
            touches: [{ clientY: 420 }],
        });
        fireEvent.touchEnd(scrollRegion);

        rerender(
            <DelayedMountHarness
                show
                messageCount={1}
                lastMessageId="m1"
                lastMessageTextLength={200}
                status="streaming"
            />
        );

        expect(scrollToMock).not.toHaveBeenCalled();
    });

    it("keeps following after a tap that does not turn into a scroll gesture", () => {
        const { rerender } = render(
            <ScrollHarness
                messageCount={1}
                lastMessageId="m1"
                lastMessageTextLength={20}
                status="streaming"
            />
        );

        const scrollRegion = screen.getByTestId("scroll-region");
        setScrollMetrics(scrollRegion, {
            scrollHeight: 577,
            clientHeight: 445,
            scrollTop: 132,
        });
        fireEvent.scroll(scrollRegion);

        scrollToMock.mockClear();

        fireEvent.touchStart(scrollRegion, {
            touches: [{ clientY: 300 }],
        });
        fireEvent.touchEnd(scrollRegion);

        rerender(
            <ScrollHarness
                messageCount={1}
                lastMessageId="m1"
                lastMessageTextLength={80}
                status="streaming"
            />
        );

        expect(scrollToMock).toHaveBeenCalledWith({ top: 577, behavior: "auto" });
    });
});
