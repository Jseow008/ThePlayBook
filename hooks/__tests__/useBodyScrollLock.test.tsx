import { renderHook } from "@testing-library/react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

describe("useBodyScrollLock", () => {
    beforeEach(() => {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
        document.documentElement.style.overflow = "";
    });

    afterEach(() => {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
        document.documentElement.style.overflow = "";
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
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

    it("freezes the body at the current scroll position and restores it", () => {
        vi.stubGlobal("scrollX", 12);
        vi.stubGlobal("scrollY", 640);
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
        document.body.style.position = "relative";
        document.body.style.top = "2px";
        document.body.style.left = "3px";
        document.body.style.right = "4px";
        document.body.style.width = "90%";

        const { unmount } = renderHook(() =>
            useBodyScrollLock(true, { freezePosition: true, lockDocumentElement: true })
        );

        expect(document.body.style.position).toBe("fixed");
        expect(document.body.style.top).toBe("-640px");
        expect(document.body.style.left).toBe("0px");
        expect(document.body.style.right).toBe("0px");
        expect(document.body.style.width).toBe("100%");

        unmount();

        expect(document.body.style.position).toBe("relative");
        expect(document.body.style.top).toBe("2px");
        expect(document.body.style.left).toBe("3px");
        expect(document.body.style.right).toBe("4px");
        expect(document.body.style.width).toBe("90%");
        expect(scrollTo).toHaveBeenCalledWith(12, 640);
    });

    it("keeps the body frozen until every position lock is released", () => {
        vi.stubGlobal("scrollX", 0);
        vi.stubGlobal("scrollY", 320);
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

        const first = renderHook(() => useBodyScrollLock(true, { freezePosition: true }));
        const second = renderHook(() => useBodyScrollLock(true, { freezePosition: true }));

        first.unmount();

        expect(document.body.style.position).toBe("fixed");
        expect(scrollTo).not.toHaveBeenCalled();

        second.unmount();

        expect(document.body.style.position).toBe("");
        expect(scrollTo).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith(0, 320);
    });
});
