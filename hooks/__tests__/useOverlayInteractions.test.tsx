import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRef, useState, type RefObject } from "react";
import { vi } from "vitest";
import { useOverlayInteractions } from "@/hooks/useOverlayInteractions";

function TestOverlay({
    label,
    open,
    onEscape,
    restoreFocusRef,
    scrollLock = false,
}: {
    label: string;
    open: boolean;
    onEscape: () => void;
    restoreFocusRef?: RefObject<HTMLElement | null>;
    scrollLock?: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const firstButtonRef = useRef<HTMLButtonElement>(null);

    useOverlayInteractions({
        enabled: open,
        containerRef,
        initialFocusRef: firstButtonRef,
        restoreFocusRef,
        onEscape,
        scrollLock,
    });

    if (!open) {
        return null;
    }

    return (
        <div ref={containerRef} role="dialog" aria-label={label} tabIndex={-1}>
            <button ref={firstButtonRef}>First {label}</button>
            <button>Last {label}</button>
        </div>
    );
}

describe("useOverlayInteractions", () => {
    beforeEach(() => {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
    });

    afterEach(() => {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
    });

    it("focuses the initial target and wraps tab navigation inside the overlay", async () => {
        render(<TestOverlay label="Modal" open onEscape={vi.fn()} />);

        const first = await screen.findByRole("button", { name: "First Modal" });
        const last = screen.getByRole("button", { name: "Last Modal" });

        await waitFor(() => expect(first).toHaveFocus());

        last.focus();
        fireEvent.keyDown(document, { key: "Tab" });
        expect(first).toHaveFocus();

        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(last).toHaveFocus();
    });

    it("routes Escape only to the top overlay", async () => {
        const onOuterEscape = vi.fn();
        const onInnerEscape = vi.fn();

        const { rerender } = render(
            <>
                <TestOverlay label="Outer" open onEscape={onOuterEscape} />
                <TestOverlay label="Inner" open onEscape={onInnerEscape} />
            </>
        );

        await screen.findByRole("dialog", { name: "Inner" });
        fireEvent.keyDown(document, { key: "Escape" });

        expect(onInnerEscape).toHaveBeenCalledTimes(1);
        expect(onOuterEscape).not.toHaveBeenCalled();

        rerender(
            <>
                <TestOverlay label="Outer" open onEscape={onOuterEscape} />
                <TestOverlay label="Inner" open={false} onEscape={onInnerEscape} />
            </>
        );

        fireEvent.keyDown(document, { key: "Escape" });
        expect(onOuterEscape).toHaveBeenCalledTimes(1);
    });

    it("locks scroll and restores focus after close", async () => {
        function Harness() {
            const openerRef = useRef<HTMLButtonElement>(null);
            const [open, setOpen] = useState(false);

            return (
                <>
                    <button ref={openerRef} onClick={() => setOpen(true)}>
                        Open modal
                    </button>
                    <TestOverlay
                        label="Restoring"
                        open={open}
                        onEscape={() => setOpen(false)}
                        restoreFocusRef={openerRef}
                        scrollLock
                    />
                </>
            );
        }

        render(<Harness />);

        const opener = screen.getByRole("button", { name: "Open modal" });
        opener.focus();
        fireEvent.click(opener);

        await screen.findByRole("dialog", { name: "Restoring" });
        expect(document.body.style.overflow).toBe("hidden");

        fireEvent.keyDown(document, { key: "Escape" });

        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Restoring" })).not.toBeInTheDocument());
        await waitFor(() => expect(opener).toHaveFocus());
        expect(document.body.style.overflow).toBe("");
    });
});
