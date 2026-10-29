import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isRegistryThrottling, retryAfterMs, startSupabase, throttledImages } from "../../scripts/start-supabase-ci.mjs";

const throttled = "failed to display json stream: toomanyrequests: retry-after: 49.173µs, allowed: 44000/minute\nfailed to pull docker image: Error response from daemon: toomanyrequests: retry-after: 371.694µs, allowed: 44000/minute\nStopping containers...\nfailed to pull docker image from all registries: ghcr.io/supabase/postgres:17.6.1.143: error pulling image configuration: download failed after attempts=1: toomanyrequests: retry-after: 866.83µs, allowed: 44000/minute\nTry rerunning the command with --debug to troubleshoot the error.";
const failed = output => ({ code: 1, signal: null, output });
const success = { code: 0, signal: null, output: "Supabase started." };

function harness(results) {
  const run = vi.fn();
  for (const result of results) run.mockResolvedValueOnce(result);
  return { run, pull: vi.fn().mockResolvedValue(success), wait: vi.fn().mockResolvedValue(undefined), random: () => 0, log: vi.fn() };
}

describe("Supabase CI image-download recovery", () => {
  it("recognizes the recorded CLI registry failure, including terminal image errors", () => {
    expect(isRegistryThrottling(throttled)).toBe(true);
    expect(isRegistryThrottling(`\x1b[31m${throttled}\x1b[0m`)).toBe(true);
    expect(isRegistryThrottling(`${throttled}\nfailed to pull docker image: ghcr.io/supabase/kong: toomanyrequests`)).toBe(true);
  });

  it("extracts only exact approved-registry references selected by the CLI", () => {
    expect(throttledImages(throttled)).toEqual(["ghcr.io/supabase/postgres:17.6.1.143"]);
    expect(throttledImages(throttled.replaceAll("ghcr.io/supabase/postgres", "other.invalid/supabase/postgres"))).toBeNull();
    expect(throttledImages(throttled.replaceAll("supabase/postgres", "supabase/unknown-image"))).toBeNull();
    expect(throttledImages("failed to pull docker image: Error response from daemon: toomanyrequests")).toBeNull();
  });

  it("serializes remaining downloads and carries only failed images into the last attempt", async () => {
    const twoImages = `${throttled}\nfailed to pull docker image from all registries: ghcr.io/supabase/kong:2.8.1: toomanyrequests: retry-after: 1ms`;
    const h = harness([failed(twoImages), success]);
    let active = 0;
    let maxActive = 0;
    let pulls = 0;
    h.pull.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      pulls += 1;
      return pulls === 2 ? failed("Error response from daemon: toomanyrequests: retry-after: 1ms") : success;
    });
    expect(await startSupabase(h)).toBe(0);
    expect(maxActive).toBe(1);
    expect(h.pull.mock.calls).toEqual([
      ["ghcr.io/supabase/postgres:17.6.1.143"],
      ["ghcr.io/supabase/kong:2.8.1"],
      ["ghcr.io/supabase/kong:2.8.1"],
    ]);
    expect(h.run).toHaveBeenCalledTimes(2);
    expect(h.wait.mock.calls).toEqual([[60_000], [120_000]]);
  });

  it("does not run startup again when serialized downloads exhaust their budget", async () => {
    const h = harness([failed(throttled)]);
    h.pull.mockResolvedValue(failed("Error response from daemon: toomanyrequests: retry-after: 1ms"));
    expect(await startSupabase(h)).toBe(1);
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.pull).toHaveBeenCalledTimes(2);
    expect(h.wait).toHaveBeenCalledTimes(2);
  });

  it.each(["Error response from daemon: unauthorized", "Error response from daemon: manifest unknown", "failed to register layer: no space left on device"])("does not retry non-transient Docker errors: %s", async output => {
    const h = harness([failed(throttled)]);
    h.pull.mockResolvedValue(failed(output));
    expect(await startSupabase(h)).toBe(1);
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.pull).toHaveBeenCalledTimes(1);
  });

  it.each([
    "toomanyrequests: retry-after: 1ms",
    "Error: database migration failed",
    "failed to pull docker image: unauthorized: authentication required",
    `${throttled}\nfailed to pull docker image: manifest unknown`,
    `${throttled}\nError: database migration failed`,
    `${throttled}\nError executing schema.sql`,
    `${throttled}\nfailed to write file: no space left on device`,
    "failed to pull docker image: 429 then access denied",
  ])("fails closed for unclear or mixed failures: %s", output => {
    expect(isRegistryThrottling(output)).toBe(false);
  });

  it("does not rerun successful startup, even if an earlier download warning occurred", async () => {
    const h = harness([{ ...success, output: throttled }]);
    expect(await startSupabase(h)).toBe(0);
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.wait).not.toHaveBeenCalled();
  });

  it("recovers on the same runner with increasing pauses and no extra startup after success", async () => {
    const h = harness([failed(throttled), failed(throttled), success]);
    expect(await startSupabase(h)).toBe(0);
    expect(h.run).toHaveBeenCalledTimes(3);
    expect(h.wait.mock.calls).toEqual([[60_000], [120_000]]);
  });

  it("keeps failure after three attempts", async () => {
    const h = harness([failed(throttled), failed(throttled), failed(throttled)]);
    expect(await startSupabase(h)).toBe(1);
    expect(h.run).toHaveBeenCalledTimes(3);
    expect(h.wait).toHaveBeenCalledTimes(2);
  });

  it("stops immediately for a non-retryable failure or cancellation", async () => {
    for (const result of [failed(`${throttled}\nError: migration failed`), { ...failed(throttled), signal: "SIGTERM" }]) {
      const h = harness([result]);
      expect(await startSupabase(h)).toBe(1);
      expect(h.run).toHaveBeenCalledTimes(1);
      expect(h.wait).not.toHaveBeenCalled();
    }
  });

  it("does not retry a launch error", async () => {
    const h = harness([]);
    h.run.mockRejectedValueOnce(new Error("CLI missing"));
    await expect(startSupabase(h)).rejects.toThrow("CLI missing");
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.wait).not.toHaveBeenCalled();
  });

  it("respects a longer registry pause but refuses one outside the bounded budget", async () => {
    const h = harness([failed(throttled.replaceAll("866.83µs", "90s")), success]);
    expect(await startSupabase(h)).toBe(0);
    expect(h.wait).toHaveBeenCalledWith(90_000);
    const tooLong = harness([failed(throttled.replaceAll("866.83µs", "10m"))]);
    expect(await startSupabase(tooLong)).toBe(1);
    expect(tooLong.wait).not.toHaveBeenCalled();
  });

  it("reads compound and second-based retry hints, retaining a conservative minimum pause", () => {
    expect(retryAfterMs(throttled)).toBe(1);
    expect(retryAfterMs("retry-after: 1m30s, allowed: 44000/minute")).toBe(90_000);
    expect(retryAfterMs("retry-after: 125\n")).toBe(125_000);
    expect(retryAfterMs("retry-after: 1H\n")).toBe(3_600_000);
  });

  it("adds bounded jitter to avoid synchronizing concurrent jobs", async () => {
    const h = harness([failed(throttled), success]);
    h.random = () => 0.999;
    expect(await startSupabase(h)).toBe(0);
    expect(h.wait).toHaveBeenCalledWith(69_990);
  });

  it("uses recovery for each CI/Security startup without changing registry authentication or health checks", () => {
    for (const path of [".github/workflows/ci.yml", ".github/workflows/security.yml"]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("npx supabase start");
      expect(source).toContain("node scripts/start-supabase-ci.mjs");
      expect(source).toContain("packages: read");
      expect(source).toContain("SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io");
      expect(source).not.toContain("--ignore-health-check");
      expect(source).not.toContain("run_with_transient_retry node scripts/start-supabase-ci.mjs");
      expect(source).toContain("Record image identities and remove registry credentials");
    }
  });

  it("runs the installed CLI with only start and preserves the existing Docker credential location", () => {
    const directory = mkdtempSync(join(tmpdir(), "netflux-start-ci-"));
    try {
      mkdirSync(join(directory, "node_modules/.bin"), { recursive: true });
      writeFileSync(join(directory, "node_modules/.bin/supabase"), '#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),registry:process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY,dockerConfig:process.env.DOCKER_CONFIG}));\n', { mode: 0o755 });
      const output = execFileSync(process.execPath, [resolve("scripts/start-supabase-ci.mjs")], {
        cwd: directory,
        encoding: "utf8",
        env: { PATH: process.env.PATH, SUPABASE_INTERNAL_IMAGE_REGISTRY: "ghcr.io", DOCKER_CONFIG: "temporary-credentials" },
      });
      expect(output).toContain('"args":["start"]');
      expect(output).toContain('"registry":"ghcr.io"');
      expect(output).toContain('"dockerConfig":"temporary-credentials"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
