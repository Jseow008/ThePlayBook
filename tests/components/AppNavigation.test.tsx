import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetflixSidebar } from "@/components/ui/NetflixSidebar";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { UserNav } from "@/components/ui/UserNav";

const { pathnameState, readingProgressState, authUserState } = vi.hoisted(() => ({
    pathnameState: { value: "/browse" },
    readingProgressState: {
        value: {
            totalLibraryItems: 6,
            inProgressCount: 2,
            completedCount: 3,
            myListCount: 1,
            isLoaded: true,
        },
    },
    authUserState: {
        value: {
            email: "reader@example.com",
            user_metadata: {
                full_name: "Reader",
            },
        } as any,
    },
}));

vi.mock("next/navigation", () => ({
    usePathname: () => pathnameState.value,
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

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => readingProgressState.value,
}));

vi.mock("@/hooks/useAuthUser", () => ({
    useAuthUser: () => authUserState.value,
}));

describe("app navigation", () => {
    beforeEach(() => {
        pathnameState.value = "/browse";
        readingProgressState.value = {
            totalLibraryItems: 6,
            inProgressCount: 2,
            completedCount: 3,
            myListCount: 1,
            isLoaded: true,
        };
    });

    it("removes Ask My Library from the profile menu", () => {
        render(<UserNav />);

        fireEvent.click(screen.getByRole("button", { name: /open user menu/i }));

        expect(screen.queryByText("Ask My Library")).not.toBeInTheDocument();
        expect(screen.getByText("Profile")).toBeInTheDocument();
        expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("renders Ask in the mobile bottom nav instead of Categories", () => {
        render(<MobileBottomNav />);

        expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /search/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^ask$/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /my library/i })).toBeInTheDocument();
        expect(screen.queryByText("Categories")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^ask$/i })).toHaveAttribute("href", "/ask");
    });

    it("adds an Ask section to the desktop sidebar with global and notes entry points", async () => {
        pathnameState.value = "/notes";
        vi.useFakeTimers();

        render(<NetflixSidebar />);

        const sidebar = screen.getByRole("complementary");
        fireEvent.mouseEnter(sidebar);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        expect(screen.getByRole("button", { name: /ask/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Ask My Library" })).toHaveAttribute("href", "/ask");
        expect(screen.getByRole("link", { name: "Ask These Notes" })).toHaveAttribute("href", "/notes?ask=1");

        vi.useRealTimers();
    });

    it("keeps a collapsed Ask shortcut in the desktop sidebar", () => {
        pathnameState.value = "/ask";
        render(<NetflixSidebar />);

        expect(screen.getByTitle("Ask")).toHaveAttribute("href", "/ask");
    });

    it("renames Surprise Me to Focus in the desktop sidebar", async () => {
        vi.useFakeTimers();

        render(<NetflixSidebar />);

        const sidebar = screen.getByRole("complementary");
        fireEvent.mouseEnter(sidebar);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        expect(screen.getByRole("link", { name: "Focus" })).toHaveAttribute("href", "/focus");
        expect(screen.queryByRole("link", { name: "Surprise Me" })).not.toBeInTheDocument();

        vi.useRealTimers();
    });
});
