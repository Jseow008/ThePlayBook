import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("LandingPageRoute", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("renders the public landing page without touching the server auth client", async () => {
        const createServerClientMock = vi.fn();

        vi.doMock("@/lib/supabase/server", () => ({
            createClient: createServerClientMock,
        }));

        vi.doMock("@/lib/supabase/public-server", () => ({
            createPublicServerClient: () => ({
                from: (table: string) => {
                    if (table !== "content_item") {
                        throw new Error(`Unexpected table: ${table}`);
                    }

                    let isCountQuery = false;
                    const builder = {
                        select: vi.fn(),
                        eq: vi.fn(),
                        is: vi.fn(),
                        order: vi.fn(),
                        limit: vi.fn(),
                    };
                    builder.select.mockImplementation((_: string, options?: { count?: string; head?: boolean }) => {
                        isCountQuery = Boolean(options?.count === "exact" && options?.head);
                        return builder;
                    });
                    builder.eq.mockReturnValue(builder);
                    builder.is.mockImplementation(() => (
                        isCountQuery
                            ? Promise.resolve({ count: 24 })
                            : builder
                    ));
                    builder.order.mockReturnValue(builder);
                    builder.limit.mockResolvedValue({
                        data: [{ id: "featured-1", title: "Featured" }],
                    });
                    return builder;
                },
                rpc: vi.fn().mockResolvedValue({
                    data: [{ category: "Business", count: 8 }],
                }),
            }),
        }));

        vi.doMock("@/components/ui/LandingPage", () => ({
            LandingPage: ({ featuredItems, totalContentCount }: { featuredItems: Array<{ title: string }>; totalContentCount: number }) => (
                <div>
                    <span>{featuredItems[0]?.title}</span>
                    <span>{totalContentCount} total</span>
                </div>
            ),
        }));

        vi.doMock("@/components/ui/LandingRedirectGuard", () => ({
            LandingRedirectGuard: () => <div data-testid="landing-redirect-guard" />,
        }));

        const landingModule = await import("@/app/page");

        render(await landingModule.default());

        expect(screen.getByTestId("landing-redirect-guard")).toBeInTheDocument();
        expect(screen.getByText("Featured")).toBeInTheDocument();
        expect(screen.getByText("24 total")).toBeInTheDocument();
        expect(createServerClientMock).not.toHaveBeenCalled();
    });
});
