import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const plan = JSON.parse(readFileSync(resolve("scripts/supabase-ci-images.json"), "utf8"));
const PUBLISHERS = {
  "edge-runtime": "supabase", gotrue: "supabase", imgproxy: "darthsim", kong: "library",
  logflare: "supabase", mailpit: "axllent", "postgres-meta": "supabase", postgres: "supabase",
  postgrest: "postgrest", realtime: "supabase", "storage-api": "supabase", studio: "supabase", vector: "timberio",
};

export function validatePlan(candidate, cliVersion, registry) {
  if (registry !== "ghcr.io") throw new Error("CI image preload requires the existing GHCR target configuration.");
  if (candidate.cliVersion !== cliVersion || candidate.platform !== "linux/amd64") {
    throw new Error("CLI version or platform changed: review the pinned image plan before running CI.");
  }
  if (!Array.isArray(candidate.images) || candidate.images.length !== Object.keys(PUBLISHERS).length) {
    throw new Error("Incomplete CI image plan.");
  }
  const seen = new Set();
  for (const image of candidate.images) {
    const match = image.source?.match(/^docker\.io\/([a-z0-9-]+)\/([a-z0-9-]+):([A-Za-z0-9_.-]+)$/);
    if (!match || !Object.hasOwn(PUBLISHERS, match[2]) || PUBLISHERS[match[2]] !== match[1]
      || seen.has(match[2]) || image.target !== `ghcr.io/supabase/${match[2]}:${match[3]}`
      || !/^sha256:[0-9a-f]{64}$/.test(image.digest)) throw new Error("Invalid publisher, digest or target in CI image plan.");
    seen.add(match[2]);
  }
}

// Fixed argument arrays, inherited isolated Docker credentials, bounded child
// lifetime, and no outer retries. A cancellation must never start another pull.
export function runCommand(command, args, { quiet = false, timeoutMs = 300_000 } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let interrupted = false;
    let timedOut = false;
    let killTimer;
    const forward = stream => chunk => {
      if (!quiet) stream.write(chunk);
      output = (output + chunk.toString()).slice(-256 * 1024);
    };
    child.stdout.on("data", forward(process.stdout));
    child.stderr.on("data", forward(process.stderr));
    const stop = () => {
      interrupted = true;
      child.kill("SIGTERM");
      killTimer ??= setTimeout(() => child.kill("SIGKILL"), 5_000);
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.once("error", error => { cleanup(); reject(error); });
    child.once("close", (code, signal) => {
      cleanup();
      done({ code: interrupted ? 1 : (code ?? 1), signal, timedOut, output });
    });
  });
}

function requireSuccess(result, action) {
  if (result.code !== 0 || result.signal || result.timedOut) throw new Error(`${action} failed; stopping CI setup.`);
}

export async function startSupabase({
  candidate = plan,
  registry = process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY,
  cli = resolve("node_modules/.bin/supabase"),
  run = runCommand,
  log = console.log,
} = {}) {
  const version = await run(cli, ["--version"], { quiet: true });
  requireSuccess(version, "CLI version check");
  validatePlan(candidate, version.output.trim(), registry);
  for (const image of candidate.images) {
    const exact = `${image.source.slice(0, image.source.lastIndexOf(":"))}@${image.digest}`;
    log(`Preparing verified CI image ${image.source}.`);
    requireSuccess(await run("docker", ["pull", "--platform", candidate.platform, exact]), "Image download");
    const result = await run("docker", ["image", "inspect", exact], { quiet: true });
    requireSuccess(result, "Image inspection");
    const inspected = JSON.parse(result.output)[0];
    if (inspected?.Os !== "linux" || inspected.Architecture !== "amd64"
      || !inspected.RepoDigests?.some(value => value.split("@")[1] === image.digest)
      || !/^sha256:[0-9a-f]{64}$/.test(inspected.Id)) throw new Error("Downloaded image identity mismatch.");
    requireSuccess(await run("docker", ["tag", exact, image.target]), "Local image alias");
    const alias = await run("docker", ["image", "inspect", image.target], { quiet: true });
    requireSuccess(alias, "Local image alias inspection");
    if (JSON.parse(alias.output)[0]?.Id !== inspected.Id) throw new Error("Local image alias identity mismatch.");
    log(`Verified ${image.target} at ${image.digest}.`);
  }
  log("All 13 pinned images verified; starting Supabase with normal health checks.");
  const result = await run(cli, ["start"]);
  requireSuccess(result, "Supabase startup");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await startSupabase(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
