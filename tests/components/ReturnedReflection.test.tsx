import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReturnedReflection } from "@/components/reader/ReturnedReflection";

const { authUser, replaceMock, composerMock } = vi.hoisted(() => ({
    authUser: { value: null as { id: string } | null },
    replaceMock: vi.fn(),
    composerMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/read/item-1",
    useSearchParams: () => new URLSearchParams("resumeReflection=1&source=library"),
    useRouter: () => ({ replace: replaceMock }),
}));
vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: () => authUser.value }));
vi.mock("@/hooks/useReflections", () => ({ useReflections: () => ({ data: [] }) }));
vi.mock("@/components/reader/ReflectionComposer", () => ({
    ReflectionComposer: (props: { isOpen: boolean; onClose: () => void }) => {
        composerMock(props);
        return props.isOpen ? <button onClick={props.onClose}>Close reflection</button> : null;
    },
}));

describe("ReturnedReflection", () => {
    beforeEach(() => {
        replaceMock.mockClear();
        composerMock.mockClear();
        authUser.value = null;
    });

    it("waits for sign-in, then opens the draft and removes only the resume marker on close", () => {
        const view = render(<ReturnedReflection contentId="item-1" contentTitle="A read" readerTheme="dark" />);
        expect(screen.queryByRole("button", { name: "Close reflection" })).not.toBeInTheDocument();

        authUser.value = { id: "reader-1" };
        view.rerender(<ReturnedReflection contentId="item-1" contentTitle="A read" readerTheme="dark" />);
        expect(screen.getByRole("button", { name: "Close reflection" })).toBeInTheDocument();
        expect(composerMock).toHaveBeenLastCalledWith(expect.objectContaining({
            contentId: "item-1",
            isAuthenticated: true,
            isOpen: true,
            returningFromSignIn: true,
        }));

        fireEvent.click(screen.getByRole("button", { name: "Close reflection" }));
        expect(replaceMock).toHaveBeenCalledWith("/read/item-1?source=library", { scroll: false });
        expect(screen.queryByRole("button", { name: "Close reflection" })).not.toBeInTheDocument();
    });
});
