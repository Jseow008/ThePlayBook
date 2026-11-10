import type { LookupAddress, LookupAllOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { createServer, type ClientRequest, type IncomingMessage, type RequestListener } from "node:http";
import type { RequestOptions } from "node:https";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/content-requests/route";
import { fetchRequestMetadata } from "@/lib/server/content-request-metadata";

const { dial, resolveAll, submit } = vi.hoisted(() => ({
    dial: vi.fn<(options: RequestOptions, onResponse: (response: IncomingMessage) => void) => ClientRequest>(),
    resolveAll: vi.fn<(hostname: string, options: LookupAllOptions) => Promise<LookupAddress[]>>(),
    submit: vi.fn(),
}));
vi.mock("node:dns/promises", async (original) => {
    const actual = await original<typeof import("node:dns/promises")>();
    return { ...actual, default: { ...actual, lookup: resolveAll }, lookup: resolveAll };
});
vi.mock("node:http", async (original) => {
    const actual = await original<typeof import("node:http")>();
    return { ...actual, default: { ...actual, request: dial }, request: dial };
});
vi.mock("node:https", async (original) => {
    const actual = await original<typeof import("node:https")>();
    return { ...actual, default: { ...actual, request: dial }, request: dial };
});
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: async () => ({ success: true }) }));
vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: () => ({
        from: () => {
            const query = {
                select: () => query, is: () => query, order: () => query, limit: () => query, eq: () => query,
                maybeSingle: async () => ({ data: null, error: null }),
                gte: async () => ({ count: 0, error: null }),
            };
            return query;
        },
        rpc: submit,
    }),
}));
vi.mock("@/lib/server/content-requests", () => ({
    fetchContentRequestById: async () => ({ id: "test-request", title: submit.mock.calls[0][1].p_title }),
}));

const PUBLIC_IP = "93.184.216.34";
const SECOND_PUBLIC_IP = "1.1.1.1";
const dns = vi.mocked(lookup as (hostname: string, options: LookupAllOptions) => Promise<LookupAddress[]>);
let reply: RequestListener;
let server: ReturnType<typeof createServer>;

beforeEach(async () => {
    vi.resetAllMocks();
    dns.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }]);
    reply = (_request, response) => response.end("<title>Example title</title>");
    server = createServer((request, response) => reply(request, response));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const { request } = await vi.importActual<typeof import("node:http")>("node:http");
    // Capture the requested address and use a disposable listener for the actual stream.
    dial.mockImplementation((options, onResponse) => request({ ...options, hostname: "127.0.0.1", port }, onResponse));
});

afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
});

describe("request metadata transport", () => {
    it.each(["127.1", "[::1]", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "[::ffff:a00:1]", "[::ffff:a9fe:a9fe]", "[2002:7f00:1::1]"])(
        "blocks non-public literal %s before dialing",
        async host => {
            await expect(fetchRequestMetadata(`http://${host}/sample`)).resolves.toEqual({});
            expect(dial).not.toHaveBeenCalled();
            expect(dns).not.toHaveBeenCalled();
        },
    );

    it("rejects a DNS answer set containing a mapped private address", async () => {
        dns.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }, { address: "::ffff:7f00:1", family: 6 }]);
        await expect(fetchRequestMetadata("https://example.test/")).resolves.toEqual({});
        expect(dial).not.toHaveBeenCalled();
    });

    it("dials the vetted IP and keeps the original Host and HTTPS identity", async () => {
        await expect(fetchRequestMetadata("https://example.test:8443/sample?q=one")).resolves.toMatchObject({ title: "Example title" });
        expect(dns).toHaveBeenCalledExactlyOnceWith("example.test", { all: true });
        expect(dial).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            hostname: PUBLIC_IP, servername: "example.test", port: "8443", path: "/sample?q=one",
            headers: expect.objectContaining({ host: "example.test:8443" }), agent: false, rejectUnauthorized: true,
        }), expect.any(Function));
    });

    it("checks and pins each redirect under the same deadline", async () => {
        dns.mockResolvedValueOnce([{ address: PUBLIC_IP, family: 4 }]);
        dns.mockResolvedValueOnce([{ address: SECOND_PUBLIC_IP, family: 4 }]);
        reply = (request, response) => {
            if (request.url === "/first") {
                response.writeHead(302, { Location: "https://next.test/final" }).end();
                return;
            }
            response.end("<title>Redirected title</title>");
        };

        await expect(fetchRequestMetadata("http://example.test/first")).resolves.toMatchObject({ title: "Redirected title" });
        expect(dns.mock.calls.map(([host]) => host)).toEqual(["example.test", "next.test"]);
        const [first, second] = dial.mock.calls.map(([options]) => options);
        expect([first.hostname, second.hostname]).toEqual([PUBLIC_IP, SECOND_PUBLIC_IP]);
        expect(second.servername).toBe("next.test");
        expect(second.signal).toBe(first.signal);
    });

    it.each(["/changed", "http://[::ffff:7f00:1]/changed"])("stops before a private redirect target (%s)", async location => {
        dns.mockResolvedValueOnce([{ address: PUBLIC_IP, family: 4 }]);
        dns.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
        reply = (_request, response) => { response.writeHead(302, { Location: location }).end(); };

        await expect(fetchRequestMetadata("http://example.test/first")).resolves.toEqual({});
        expect(dial).toHaveBeenCalledOnce();
    });

    it("closes a chunked body at the exact byte limit and keeps metadata in the prefix", async () => {
        const prefix = "<title>Bounded title</title>";
        const closed = new Promise<void>(resolve => {
            reply = (_request, response) => {
                response.once("close", resolve);
                response.write(prefix + "x".repeat(250_000 - prefix.length));
                // Keep the connection open to show the reader stops before EOF.
            };
        });

        await expect(fetchRequestMetadata("http://example.test/large")).resolves.toMatchObject({ title: "Bounded title" });
        await closed;
    });

    it("aborts a stalled response body after headers arrive", async () => {
        const closed = new Promise<void>(resolve => {
            reply = (_request, response) => {
                response.once("close", resolve);
                response.writeHead(200, { "Content-Type": "text/html" }).flushHeaders();
            };
        });

        await expect(fetchRequestMetadata("http://example.test/slow")).resolves.toEqual({});
        expect(dial.mock.calls[0][0].signal?.aborted).toBe(true);
        await closed;
    }, 8_000);

    it("retains the YouTube oEmbed path and validates its thumbnail URL", async () => {
        reply = (_request, response) => response.end(JSON.stringify({
            title: "Video title", thumbnail_url: "https://i.ytimg.com/sample.jpg",
        }));
        await expect(fetchRequestMetadata("https://youtu.be/example")).resolves.toEqual({
            title: "Video title", thumbnail_url: "https://i.ytimg.com/sample.jpg",
        });
        expect(dial.mock.calls[0][0]).toMatchObject({ hostname: PUBLIC_IP, servername: "www.youtube.com" });
        expect(dns.mock.calls.map(([host]) => host)).toEqual(["www.youtube.com", "i.ytimg.com"]);
    });
});

it("submits the URL with a derived title when metadata is unavailable", async () => {
    reply = (_request, response) => { response.writeHead(503).end(); };
    submit.mockReturnValue({ single: async () => ({ data: { request_id: "test-request", duplicate: false }, error: null }) });

    const response = await POST(new NextRequest("http://localhost/api/content-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "https://example.test/example-article" }),
    }));

    expect(response.status).toBe(201);
    expect(submit).toHaveBeenCalledWith("submit_content_request", expect.objectContaining({
        p_title: "example article", p_source_url: "https://example.test/example-article", p_thumbnail_url: null,
    }));
    expect((await response.json()).data.request.title).toBe("example article");
});
