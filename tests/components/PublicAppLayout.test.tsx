import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PublicAppLayout", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("hydrates auth-aware providers from the server user", async () => {
        const mockUser = {
            id: "reader-1",
            email: "reader@example.com",
        } as any;

        const getUser = vi.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
        });

        const createClient = vi.fn().mockResolvedValue({
            auth: {
                getUser,
            },
        });

        const authProvider = vi.fn(
            ({ children }: { children: React.ReactNode }) => <div data-testid="auth-provider">{children}</div>
        );
        const readingProvider = vi.fn(
            ({ children }: { children: React.ReactNode }) => <div data-testid="reading-provider">{children}</div>
        );

        vi.doMock("@/lib/supabase/server", () => ({
            createClient,
        }));

        vi.doMock("@/hooks/useAuthUser", () => ({
            AuthUserProvider: authProvider,
        }));

        vi.doMock("@/hooks/useReadingProgress", () => ({
            ReadingProgressProvider: readingProvider,
        }));

        vi.doMock("@/components/ui/PublicLayoutShell", () => ({
            PublicLayoutShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
        }));

        const layoutModule = await import("@/app/(public)/layout");

        render(await layoutModule.default({ children: <div>App content</div> }));

        expect(screen.getByTestId("auth-provider")).toBeInTheDocument();
        expect(screen.getByTestId("reading-provider")).toBeInTheDocument();
        expect(screen.getByTestId("shell")).toBeInTheDocument();
        expect(screen.getByText("App content")).toBeInTheDocument();
        expect(createClient).toHaveBeenCalledTimes(1);
        expect(getUser).toHaveBeenCalledTimes(1);
        expect(authProvider.mock.calls[0]?.[0]?.initialUser).toBe(mockUser);
        expect(readingProvider.mock.calls[0]?.[0]?.initialUser).toBe(mockUser);
    });
});
