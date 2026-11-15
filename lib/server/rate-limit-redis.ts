import "server-only";

import { Redis, type Requester, type UpstashRequest, type UpstashResponse } from "@upstash/redis";
import type { Dispatcher } from "undici";
import Pool from "undici/lib/dispatcher/pool.js";

const IDLE_CONNECTION_MS = 60_000;
const NETWORK_RETRIES = 5;

type PooledRequestInit = RequestInit & { dispatcher: Dispatcher };

function decodeResult(value: unknown): unknown {
  if (typeof value === "string") {
    // Upstash can return the literal status OK even with base64 requested. Match
    // the SDK's fallback for unencoded strings rather than silently corrupting it.
    if (value === "OK") return value;
    try {
      return new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(decodeResult);
  return value;
}

function decodeReply(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeReply);
  if (!value || typeof value !== "object") throw new Error("Invalid rate-limit Redis response.");
  const reply = value as Record<string, unknown>;
  if (!("result" in reply || "error" in reply)
      || (reply.error !== undefined && typeof reply.error !== "string")) {
    throw new Error("Invalid rate-limit Redis response.");
  }
  return { result: decodeResult(reply.result), error: reply.error };
}

/** Private to the limiter: SDK command serialization/pipelining stays in Redis. */
class RateLimitRedisRequester implements Requester {
  readonly readYourWrites = true;
  upstashSyncToken = "";
  private readonly origin: string;
  private readonly pool: Pool;

  constructor(url: string, private readonly token: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Rate-limit Redis requires an HTTPS origin URL.");
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password
        || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("Rate-limit Redis requires an HTTPS origin URL.");
    }
    this.origin = parsed.origin;
    this.pool = new Pool(this.origin, {
      connections: null,
      pipelining: 1,
      allowH2: false,
      keepAliveTimeout: IDLE_CONNECTION_MS,
      keepAliveMaxTimeout: IDLE_CONNECTION_MS,
      keepAliveTimeoutThreshold: 1_000,
    });
  }

  async request<TResult = unknown>(request: UpstashRequest): Promise<UpstashResponse<TResult>> {
    // The limiter uses JSON commands and pipelines only. Never turn a path or a
    // redirect into another credential-bearing destination.
    const path = request.path?.join("/") ?? "";
    if (!["", "pipeline", "multi-exec"].includes(path) || request.isStreaming || request.onMessage) {
      throw new Error("Unsupported rate-limit Redis request.");
    }
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    headers.set("Content-Type", "application/json");
    headers.set("Upstash-Encoding", "base64");
    headers.set("upstash-sync-token", this.upstashSyncToken);
    const init: PooledRequestInit = {
      method: "POST",
      headers,
      body: JSON.stringify(request.body),
      cache: "no-store",
      keepalive: true,
      redirect: "error",
      signal: request.signal,
      dispatcher: this.pool,
    };

    let response: Response | undefined;
    // Match the SDK's existing network-error retry count/backoff. HTTP/command
    // errors are not retried here; Ratelimit still owns its five-second deadline.
    for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
      try {
        response = await fetch(`${this.origin}/${path}`, init);
        break;
      } catch (error) {
        if (attempt === NETWORK_RETRIES || request.signal?.aborted) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.exp(attempt) * 50));
      }
    }
    if (!response?.ok) {
      // Consume the body so the socket can return to the pool, without exposing
      // backend messages, command arguments or credentials in transport errors.
      await response?.text();
      throw new Error(`Rate-limit Redis HTTP failure (${response?.status ?? "unavailable"}).`);
    }
    this.upstashSyncToken = response.headers.get("upstash-sync-token") ?? "";
    let reply: unknown;
    try {
      reply = await response.json();
    } catch {
      throw new Error("Invalid rate-limit Redis JSON response.");
    }
    // Redis's Requester contract covers both command replies and pipeline arrays.
    return decodeReply(reply) as UpstashResponse<TResult>;
  }
}

class RateLimitRedis extends Redis {
  constructor(options: { url: string; token: string }) {
    super(new RateLimitRedisRequester(options.url, options.token));
    // The custom-requester constructor skips the Node SDK's automatic proxy.
    // Preserve its normal batching rather than adding one HTTP request per command.
    return this.autoPipeline();
  }
}

export function createRateLimitRedis(options: { url: string; token: string }): Redis {
  return new RateLimitRedis(options);
}
