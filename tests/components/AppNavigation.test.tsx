import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetfluxSidebar } from "@/components/ui/NetfluxSidebar";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { UserNav } from "@/components/ui/UserNav";

const { pathnameState, searchParamsState, readingProgressState, authUserState } = vi.hoisted(() => ({
    pathnameState: { value: "/browse" },
    searchParamsState: { value: "" },
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
    useSearchParams: () => new URLSearchParams(searchParamsState.value),
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
        searchParamsState.value = "";
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

    it("renders Focus in the mobile bottom nav instead of Ask", () => {
        render(<MobileBottomNav />);

        expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /search/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^focus$/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /my library/i })).toBeInTheDocument();
        expect(screen.queryByText("Categories")).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /^ask$/i })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^focus$/i })).toHaveAttribute("href", "/focus");
    });

    it("adds an Ask section to the desktop sidebar with global and notes entry points", async () => {
        pathnameState.value = "/ask";
        vi.useFakeTimers();

        render(<NetfluxSidebar />);

        const sidebar = screen.getByRole("complementary");
        fireEvent.mouseEnter(sidebar);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        expect(screen.getByRole("button", { name: /ask/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/ask");
        expect(screen.getByRole("link", { name: "Current Notes" })).toHaveAttribute("href", "/notes?ask=1");

        vi.useRealTimers();
    });

    it("opens the Library submenu from the expanded desktop sidebar", async () => {
        vi.useFakeTimers();

        render(<NetfluxSidebar />);

        const sidebar = screen.getByRole("complementary");
        fireEvent.mouseEnter(sidebar);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        const libraryButton = screen.getByRole("button", { name: /my library/i });
        expect(libraryButton).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(libraryButton);

        expect(libraryButton).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("link", { name: /my list/i })).toHaveAttribute("href", "/library/my-list");
        expect(screen.getByRole("link", { name: /continue reading/i })).toHaveAttribute("href", "/library/reading");
        expect(screen.getByRole("link", { name: /completed/i })).toHaveAttribute("href", "/library/completed");

        vi.useRealTimers();
    });

    it("expands the desktop sidebar on keyboard focus so submenu destinations are reachable", () => {
        render(<NetfluxSidebar />);

        fireEvent.focus(screen.getByRole("link", { name: /search/i }));

        const libraryButton = screen.getByRole("button", { name: /my library/i });
        expect(libraryButton).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /ask/i })).toBeInTheDocument();
    });

    it("opens the Library submenu even before reading progress finishes loading", async () => {
        readingProgressState.value = {
            totalLibraryItems: 0,
            inProgressCount: 0,
            completedCount: 0,
            myListCount: 0,
            isLoaded: false,
        };
        vi.useFakeTimers();

        render(<NetfluxSidebar />);

        const sidebar = screen.getByRole("complementary");
        fireEvent.mouseEnter(sidebar);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        const libraryButton = screen.getByRole("button", { name: /my library/i });
        expect(libraryButton).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(libraryButton);

        expect(libraryButton).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("link", { name: "My List" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Continue Reading" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Completed" })).toBeInTheDocument();

        vi.useRealTimers();
    });

    it("surfaces Notes as a top-level desktop sidebar destination", async () => {
        pathnameState.value = "/notes";
        vi.useFakeTimers();

        render(<NetfluxSidebar />);

        const sidebar = screen.getByRole("complementary");
        fireEvent.mouseEnter(sidebar);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        const notesLink = screen.getByRole("link", { name: /^notes$/i });
        expect(notesLink).toHaveAttribute("href", "/notes");
        expect(notesLink).toHaveClass("border-l-4");
        expect(screen.getByRole("button", { name: /ask/i })).not.toHaveClass("border-l-4");

        vi.useRealTimers();
    });

    it("highlights Current Notes instead of Notes for the notes ask query", async () => {
        pathnameState.value = "/notes";
        searchParamsState.value = "ask=1";
        vi.useFakeTimers();

        render(<NetfluxSidebar />);

        const sidebar = screen.getByRole("complementary");
        fireEvent.mouseEnter(sidebar);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        expect(screen.getByRole("link", { name: /^notes$/i })).not.toHaveClass("border-l-4");
        expect(screen.getByRole("button", { name: /ask/i })).toHaveClass("border-l-4");
        expect(screen.getByRole("link", { name: "Current Notes" })).toHaveClass("bg-accent");
        expect(screen.getByRole("link", { name: "Library" })).not.toHaveClass("bg-accent");

        vi.useRealTimers();
    });

    it("highlights Current Notes on the full-screen notes ask route", async () => {
        pathnameState.value = "/ask";
        searchParamsState.value = "scope=notes";
        vi.useFakeTimers();

        render(<NetfluxSidebar />);

        const sidebar = screen.getByRole("complementary");
        fireEvent.mouseEnter(sidebar);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        expect(screen.getByRole("button", { name: /ask/i })).toHaveClass("border-l-4");
        expect(screen.getByRole("link", { name: "Current Notes" })).toHaveClass("bg-accent");
        expect(screen.getByRole("link", { name: "Library" })).not.toHaveClass("bg-accent");

        vi.useRealTimers();
    });

    it("keeps a collapsed Ask shortcut in the desktop sidebar", () => {
        pathnameState.value = "/ask";
        render(<NetfluxSidebar />);

        expect(screen.getByTitle("Ask")).toHaveAttribute("href", "/ask");
    });

    it("renames Surprise Me to Focus in the desktop sidebar", async () => {
        vi.useFakeTimers();

        render(<NetfluxSidebar />);

        const sidebar = screen.getByRole("complementary");
        fireEvent.mouseEnter(sidebar);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        expect(screen.getByRole("link", { name: "Focus" })).toHaveAttribute("href", "/focus");
        expect(screen.queryByRole("link", { name: "Surprise Me" })).not.toBeInTheDocument();

        vi.useRealTimers();
    });

    it("removes Browse Categories from the desktop sidebar", async () => {
        vi.useFakeTimers();

        render(<NetfluxSidebar />);

        const sidebar = screen.getByRole("complementary");
        fireEvent.mouseEnter(sidebar);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        expect(screen.queryByRole("link", { name: /browse categories/i })).not.toBeInTheDocument();
        expect(screen.queryByTitle("Browse Categories")).not.toBeInTheDocument();

        vi.useRealTimers();
    });
});
