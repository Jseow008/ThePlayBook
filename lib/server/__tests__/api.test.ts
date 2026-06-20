import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestId, apiError, logApiError } from "../api";

const sentryMocks = vi.hoisted(() => ({
    captureException: vi.fn(),
    withScope: vi.fn((callback: (scope: {
        setTag: ReturnType<typeof vi.fn>;
        setContext: ReturnType<typeof vi.fn>;
        setUser: ReturnType<typeof vi.fn>;
        setExtra: ReturnType<typeof vi.fn>;
    }) => void) => callback({
        setTag: vi.fn(),
        setContext: vi.fn(),
        setUser: vi.fn(),
        setExtra: vi.fn(),
    })),
}));

vi.mock("@sentry/nextjs", () => sentryMocks);

describe("api utilities", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getRequestId", () => {
        it("returns a string UUID", () => {
            const id = getRequestId();
            expect(typeof id).toBe("string");
            expect(id.length).toBeGreaterThan(0);
        });
    });

    describe("apiError", () => {
        it("returns a NextResponse with correct JSON payload and status", async () => {
            const code = "NOT_FOUND";
            const message = "The resource could not be found";
            const status = 404;
            const requestId = "test-request-id";

            // Assuming NextResponse.json returns an actual Response object in Node.js >= 18
            const response = apiError(code, message, status, requestId);

            expect(response.status).toBe(status);

            const data = await response.json();
            expect(data).toEqual({
                error: {
                    code,
                    message,
                    request_id: requestId,
                }
            });
        });
    });

    describe("logApiError", () => {
        it("logs standard error properly", () => {
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

            const error = new Error("Test internal error");
            logApiError({
                requestId: "test-req",
                route: "/api/test",
                message: "Something failed",
                error,
                userId: "user-123"
            });

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                {
                    request_id: "test-req",
                    route: "/api/test",
                    user_id: "user-123",
                    message: "Something failed",
                },
                {
                    error_name: "Error",
                    error_message: "Test internal error",
                }
            );
            expect(sentryMocks.withScope).toHaveBeenCalled();
            expect(sentryMocks.captureException).toHaveBeenCalledWith(error);

            consoleErrorSpy.mockRestore();
        });

        it("logs unknown error securely", () => {
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

            logApiError({
                requestId: "test-req-2",
                route: "/api/test",
                message: "Something failed with string",
                error: "Bad string error",
            });

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                {
                    request_id: "test-req-2",
                    route: "/api/test",
                    user_id: undefined,
                    message: "Something failed with string",
                },
                {
                    error: "Bad string error",
                }
            );
            expect(sentryMocks.captureException).toHaveBeenCalledWith(expect.any(Error));
            expect(sentryMocks.captureException.mock.calls[0][0].message).toBe("Something failed with string");

            consoleErrorSpy.mockRestore();
        });
    });
});
