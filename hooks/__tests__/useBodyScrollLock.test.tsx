import { renderHook } from "@testing-library/react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

describe("useBodyScrollLock", () => {
    beforeEach(() => {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
    });

    afterEach(() => {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
    });

    it("locks and restores body overflow", () => {
        document.body.style.overflow = "auto";

        const { unmount } = renderHook(() => useBodyScrollLock(true));

        expect(document.body.style.overflow).toBe("hidden");

        unmount();

        expect(document.body.style.overflow).toBe("auto");
    });

    it("keeps body locked until every overlapping body lock is released", () => {
        document.body.style.overflow = "clip";

        const first = renderHook(() => useBodyScrollLock(true));
        const second = renderHook(() => useBodyScrollLock(true));

        expect(document.body.style.overflow).toBe("hidden");

        first.unmount();

        expect(document.body.style.overflow).toBe("hidden");

        second.unmount();

        expect(document.body.style.overflow).toBe("clip");
    });

    it("locks and restores documentElement when requested", () => {
        document.body.style.overflow = "auto";
        document.documentElement.style.overflow = "scroll";

        const { unmount } = renderHook(() =>
            useBodyScrollLock(true, { lockDocumentElement: true })
        );

        expect(document.body.style.overflow).toBe("hidden");
        expect(document.documentElement.style.overflow).toBe("hidden");

        unmount();

        expect(document.body.style.overflow).toBe("auto");
        expect(document.documentElement.style.overflow).toBe("scroll");
    });

    it("tracks body and documentElement lock lifetimes independently", () => {
        document.body.style.overflow = "auto";
        document.documentElement.style.overflow = "visible";

        const bodyOnly = renderHook(() => useBodyScrollLock(true));
        const bodyAndHtml = renderHook(() =>
            useBodyScrollLock(true, { lockDocumentElement: true })
        );

        bodyAndHtml.unmount();

        expect(document.body.style.overflow).toBe("hidden");
        expect(document.documentElement.style.overflow).toBe("visible");

        bodyOnly.unmount();

        expect(document.body.style.overflow).toBe("auto");
    });

    it("releases and reacquires when enabled toggles", () => {
        document.body.style.overflow = "auto";

        const { rerender, unmount } = renderHook(
            ({ enabled }) => useBodyScrollLock(enabled),
            { initialProps: { enabled: false } }
        );

        expect(document.body.style.overflow).toBe("auto");

        rerender({ enabled: true });

        expect(document.body.style.overflow).toBe("hidden");

        rerender({ enabled: false });

        expect(document.body.style.overflow).toBe("auto");

        rerender({ enabled: true });

        expect(document.body.style.overflow).toBe("hidden");

        unmount();

        expect(document.body.style.overflow).toBe("auto");
    });

    it("does not disturb an active body lock when another lock toggles off", () => {
        const persistentLock = renderHook(() => useBodyScrollLock(true));
        const toggledLock = renderHook(
            ({ enabled }) => useBodyScrollLock(enabled),
            { initialProps: { enabled: true } }
        );

        toggledLock.rerender({ enabled: false });

        expect(document.body.style.overflow).toBe("hidden");

        persistentLock.unmount();

        expect(document.body.style.overflow).toBe("");
    });
});
