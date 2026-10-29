import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [60_000, 120_000];
const MAX_PAUSE_MS = 300_000;
const OUTPUT_LIMIT = 256 * 1024;

export function isRegistryThrottling(output) {
  // Fail closed: an earlier 429 must not turn a later migration/auth/disk error
  // into a retry. Require the CLI's terminal image-pull failure, and reject any
  // other reported failures in this attempt.
  const lines = stripVTControlCharacters(output).split(/[\r\n]+/).map(line => line.trim());
  const failures = lines.filter(line => /^(?:failed\b|error\b|fatal\b)/i.test(line));
  const imagePull = /^failed to pull docker image(?: from all registries)?\b/i;
  return failures.some(line => imagePull.test(line)) && failures.every(line =>
    /^failed to (?:pull docker image|display json stream)\b/i.test(line)
    && /\btoomanyrequests\b|\b429\b/i.test(line)
    && !/unauthorized|authentication required|access denied|manifest unknown|no space left|certificate|\b403\b/i.test(line)
  );
}

export function retryAfterMs(output) {
  let maximum = 0;
  const units = { ns: 0.000001, us: 0.001, "µs": 0.001, "μs": 0.001, ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  for (const match of output.matchAll(/retry-after:\s*((?:\d+(?:\.\d+)?(?:ns|µs|μs|us|ms|s|m|h))+|\d+(?:\.\d+)?)(?=[,\s]|$)/gi)) {
    const value = match[1].toLowerCase();
    let duration = 0;
    if (/^\d+(?:\.\d+)?$/.test(value)) duration = Number(value) * 1000;
    else for (const part of value.matchAll(/(\d+(?:\.\d+)?)(ns|µs|μs|us|ms|s|m|h)/g)) duration += Number(part[1]) * units[part[2]];
    maximum = Math.max(maximum, Math.ceil(duration));
  }
  return maximum;
}

function runCli() {
  return new Promise((done, reject) => {
    // Use the installed, lockfile-pinned CLI. Never install or choose a new CLI
    // version while trying to recover an image download.
    const cli = resolve("node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
    const child = spawn(cli, ["start"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const forward = stream => chunk => {
      stream.write(chunk);
      output = (output + chunk.toString()).slice(-OUTPUT_LIMIT);
    };
    child.stdout.on("data", forward(process.stdout));
    child.stderr.on("data", forward(process.stderr));
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    child.once("error", error => { cleanup(); reject(error); });
    child.once("close", (code, signal) => { cleanup(); done({ code: code ?? 1, signal, output }); });
  });
}

export async function startSupabase({ run = runCli, wait = sleep, random = Math.random, log = console.log } = {}) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    log(`Starting Supabase (attempt ${attempt}/${MAX_ATTEMPTS}).`);
    const result = await run();
    if (result.signal) return result.code || 1;
    if (result.code === 0) return 0;
    if (attempt === MAX_ATTEMPTS || !isRegistryThrottling(result.output)) return result.code || 1;
    const retryAfter = retryAfterMs(result.output);
    if (retryAfter > MAX_PAUSE_MS) {
      log("Registry requests a pause beyond this job's retry budget; leaving setup failed.");
      return result.code || 1;
    }
    const delay = Math.min(MAX_PAUSE_MS, Math.max(BACKOFF_MS[attempt - 1], retryAfter) + Math.floor(random() * 10_000));
    log(`Registry throttled image downloads; retrying in ${Math.ceil(delay / 1000)}s on this runner, keeping downloaded images.`);
    await wait(delay);
  }
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await startSupabase(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
