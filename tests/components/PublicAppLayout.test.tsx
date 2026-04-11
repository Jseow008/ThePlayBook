import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PublicAppLayout", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("wraps the public shell with auth and reading-progress providers", async () => {
        const authProvider = vi.fn(
            ({ children }: { children: React.ReactNode }) => <div data-testid="auth-provider">{children}</div>
        );
        const readingProvider = vi.fn(
            ({ children }: { children: React.ReactNode }) => <div data-testid="reading-provider">{children}</div>
        );

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
        expect(authProvider).toHaveBeenCalledTimes(1);
        expect(readingProvider).toHaveBeenCalledTimes(1);
    });
});
