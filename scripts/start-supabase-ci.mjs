import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [60_000, 120_000];
const MAX_PAUSE_MS = 300_000;
const OUTPUT_LIMIT = 256 * 1024;
const IMAGE_NAMES = new Set(["postgres", "gotrue", "postgrest", "realtime", "storage-api", "edge-runtime", "studio", "postgres-meta", "logflare", "supavisor", "kong", "mailpit", "imgproxy", "vector"]);

function diagnosticLines(output) {
  return stripVTControlCharacters(output).split(/[\r\n]+/).map(line => line.trim());
}

function isThrottleLine(line) {
  return /\btoomanyrequests\b|\b429\b/i.test(line)
    && !/unauthorized|authentication required|access denied|manifest unknown|no space left|certificate|\b403\b/i.test(line);
}

export function isRegistryThrottling(output) {
  // Fail closed: an earlier 429 must not turn a later migration/auth/disk error
  // into a retry. Require the CLI's terminal image-pull failure, and reject any
  // other reported failures in this attempt.
  const lines = diagnosticLines(output);
  const failures = lines.filter(line => /^(?:failed\b|error\b|fatal\b)/i.test(line));
  const imagePull = /^failed to pull docker image(?: from all registries)?\b/i;
  return failures.some(line => imagePull.test(line)) && failures.every(line =>
    /^failed to (?:pull docker image|display json stream)\b/i.test(line)
    && isThrottleLine(line)
  );
}

export function throttledImages(output) {
  if (!isRegistryThrottling(output)) return null;
  const failures = diagnosticLines(output).filter(line => /^failed to pull docker image(?: from all registries)?\b/i.test(line));
  const images = [];
  for (const line of failures) {
    const match = line.match(/^failed to pull docker image(?: from all registries)?:\s+(ghcr\.io\/supabase\/([a-z0-9-]+):[A-Za-z0-9_.-]+)(?=:\s|\s|$)/i);
    if (!match || !IMAGE_NAMES.has(match[2])) return null;
    images.push(match[1]);
  }
  return [...new Set(images)];
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

function runCommand(command, args) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
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

function runCli() {
  // Use the installed, lockfile-pinned CLI. Never install or choose a new CLI
  // version while trying to recover an image download.
  const cli = resolve("node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  return runCommand(cli, ["start"]);
}

function isDockerThrottling(output) {
  const errors = diagnosticLines(output).filter(line => /^(?:failed\b|error\b|fatal\b|toomanyrequests\b)/i.test(line));
  return errors.length > 0 && errors.every(isThrottleLine);
}

export async function startSupabase({ run = runCli, pull = image => runCommand("docker", ["pull", image]), wait = sleep, random = Math.random, log = console.log } = {}) {
  let pendingImages = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    log(`Starting Supabase (attempt ${attempt}/${MAX_ATTEMPTS}).`);
    let result;
    let failure;
    if (pendingImages.length > 0) {
      const remaining = [];
      let hint = 0;
      // The first hosted trial retained downloaded images but still exhausted
      // retries because the CLI pulled missing images concurrently. Serialize
      // only the exact failed references, without adding another retry loop.
      for (const [index, image] of pendingImages.entries()) {
        log(`Preparing remaining image ${image}.`);
        const download = await pull(image);
        if (download.signal) return download.code || 1;
        if (download.code === 0) continue;
        if (!isDockerThrottling(download.output)) return download.code || 1;
        // A registry-wide throttle applies to subsequent downloads too. Leave
        // the unattempted references for the next bounded backoff phase.
        remaining.push(...pendingImages.slice(index));
        hint = Math.max(hint, retryAfterMs(download.output));
        break;
      }
      if (remaining.length > 0) {
        result = { code: 1 };
        failure = { images: remaining, hint };
      }
    }
    if (!result) result = await run();
    if (result.signal) return result.code || 1;
    if (result.code === 0) return 0;
    if (attempt === MAX_ATTEMPTS) return result.code || 1;
    if (!failure) {
      const images = throttledImages(result.output);
      if (!images) return result.code || 1;
      failure = { images, hint: retryAfterMs(result.output) };
    }
    pendingImages = failure.images;
    const retryAfter = failure.hint;
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
