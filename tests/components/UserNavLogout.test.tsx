import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserNav } from "@/components/ui/UserNav";

const { browserSignOutMock, signOutActionMock, toastErrorMock } = vi.hoisted(() => ({
    browserSignOutMock: vi.fn(),
    signOutActionMock: vi.fn(),
    toastErrorMock: vi.fn(),
}));

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: React.ReactNode;
        href: string;
    } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("next/image", () => ({
    default: (props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; unoptimized?: boolean }) => {
        const { alt, src, fill, priority, unoptimized, ...safeProps } = props;
        void fill;
        void priority;
        void unoptimized;
        return <img alt={alt} src={src} {...safeProps} />;
    },
}));

vi.mock("@/hooks/useAuthUser", () => ({
    useAuthUser: () => ({
        email: "reader@example.com",
        user_metadata: {
            full_name: "Reader",
        },
    }),
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            signOut: browserSignOutMock,
        },
    }),
}));

vi.mock("@/lib/actions/auth", () => ({
    signOutAction: () => signOutActionMock(),
}));

vi.mock("sonner", () => ({
    toast: {
        error: toastErrorMock,
    },
}));

describe("UserNav logout", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        browserSignOutMock.mockResolvedValue({ error: null });
        signOutActionMock.mockResolvedValue(undefined);
    });

    it("emits a browser auth sign-out before running the server logout action", async () => {
        render(<UserNav />);

        fireEvent.click(await screen.findByRole("button", { name: /open user menu/i }));

        await act(async () => {
            fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
        });

        expect(browserSignOutMock).toHaveBeenCalledTimes(1);
        expect(signOutActionMock).toHaveBeenCalledTimes(1);
    });

    it("does not run the server logout action when browser sign-out fails", async () => {
        browserSignOutMock.mockResolvedValue({
            error: {
                message: "Browser logout failed",
            },
        });

        render(<UserNav />);

        fireEvent.click(await screen.findByRole("button", { name: /open user menu/i }));

        await act(async () => {
            fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
        });

        expect(signOutActionMock).not.toHaveBeenCalled();
        expect(toastErrorMock).toHaveBeenCalledWith("Browser logout failed");
    });
});
