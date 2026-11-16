import { act, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { format } from "date-fns";
import { NotesTimestamp } from "@/components/notes/NotesTimestamp";

const timestamp = "2026-11-14T16:43:01.133Z";

describe("NotesTimestamp", () => {
    it("renders an explicit deterministic UTC time on the server", () => {
        expect(renderToString(<NotesTimestamp createdAt={timestamp} />)).toBe(
            '<time dateTime="2026-11-14T16:43:01.133Z">Nov 14, 4:43 PM UTC</time>',
        );
    });

    it("hydrates the server markup without recovering, then shows local time", async () => {
        const container = document.createElement("div");
        container.innerHTML = renderToString(<NotesTimestamp createdAt={timestamp} />);
        document.body.appendChild(container);
        const serverTime = container.querySelector("time");
        const onRecoverableError = vi.fn();
        let root: ReturnType<typeof hydrateRoot> | undefined;
        try {
            await act(async () => {
                root = hydrateRoot(container, <NotesTimestamp createdAt={timestamp} />, { onRecoverableError });
            });
            expect(onRecoverableError).not.toHaveBeenCalled();
            expect(container.querySelector("time")).toBe(serverTime);
            expect(serverTime).toHaveTextContent(format(new Date(timestamp), "MMM d, h:mm a"));
            expect(serverTime).toHaveAttribute("datetime", timestamp);
        } finally {
            await act(async () => root?.unmount());
            container.remove();
        }
    });

    it("uses current local time immediately for a client-only mount and date changes", () => {
        const { container, rerender } = render(<NotesTimestamp createdAt={timestamp} />);
        expect(container.textContent).toBe(format(new Date(timestamp), "MMM d, h:mm a"));
        const next = "2026-03-08T10:30:00Z";
        rerender(<NotesTimestamp createdAt={next} />);
        expect(container.textContent).toBe(format(new Date(next), "MMM d, h:mm a"));
        expect(container.querySelector("time")).toHaveAttribute("datetime", next);
    });

    it.each([undefined, null, "", "not-a-date"])("retains a readable fallback for %s", (createdAt) => {
        const { container } = render(<NotesTimestamp createdAt={createdAt} />);
        expect(container.textContent).toBe("Saved passage");
        expect(container.querySelector("time")).not.toHaveAttribute("datetime");
    });
});
