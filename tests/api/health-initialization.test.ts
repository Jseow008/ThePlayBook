import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/supabase/public-server");
    vi.resetModules();
});

it("bounds lazy initialization and does not start a query after its deadline", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const createClient = vi.fn();
    let release!: (value: { createPublicServerClient: typeof createClient }) => void;
    vi.doMock("@/lib/supabase/public-server", () => new Promise(resolve => { release = resolve; }));
    const { checkDatabaseConnectivity } = await import("@/app/api/health/database-check");
    const pending = checkDatabaseConnectivity();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toEqual({ database: "unreachable", issue: "Database connectivity check timed out." });
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ reason: "timeout", query_ms: null });
    release({ createPublicServerClient: createClient });
    await vi.advanceTimersByTimeAsync(0);
    expect(createClient).not.toHaveBeenCalled();
});
