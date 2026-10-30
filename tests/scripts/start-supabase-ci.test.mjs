import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runCommand, startSupabase, validatePlan } from "../../scripts/start-supabase-ci.mjs";

const plan = JSON.parse(readFileSync("scripts/supabase-ci-images.json", "utf8"));
const success = output => ({ code: 0, signal: null, output });
const imageId = `sha256:${"a".repeat(64)}`;
function harness() {
  const run = vi.fn(async (command, args) => {
    if (args[0] === "--version") return success(plan.cliVersion);
    if (args[0] === "image") {
      const reference = args[2];
      const digest = reference.split("@")[1];
      return success(JSON.stringify([{ Id: imageId, Os: "linux", Architecture: "amd64", RepoDigests: digest ? [reference] : [] }]));
    }
    return success("");
  });
  return { run, candidate: structuredClone(plan), registry: "ghcr.io", cli: "/locked/supabase", log: vi.fn() };
}

describe("verified original-publisher CI image preload", () => {
  it("keeps the manifest tied to the lockfile CLI and approved 13-image evidence", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    expect(plan.cliVersion).toBe(lock.packages["node_modules/supabase"].version);
    expect(() => validatePlan(plan, plan.cliVersion, "ghcr.io")).not.toThrow();
    expect(plan.images.find(image => image.source.includes("/kong:"))?.source).toBe("docker.io/library/kong:2.8.1");
    expect(plan.images.find(image => image.source.includes("/imgproxy:"))?.source).toBe("docker.io/darthsim/imgproxy:v3.8.0");
  });

  it("downloads immutable digests serially and verifies aliases before normal startup", async () => {
    const h = harness();
    expect(await startSupabase(h)).toBe(0);
    const calls = h.run.mock.calls;
    expect(calls[0].slice(0, 2)).toEqual(["/locked/supabase", ["--version"]]);
    expect(calls.at(-1)).toEqual(["/locked/supabase", ["start"]]);
    expect(calls).toHaveLength(2 + 13 * 4);
    for (const [i, image] of plan.images.entries()) {
      const exact = `${image.source.slice(0, image.source.lastIndexOf(":"))}@${image.digest}`;
      expect(calls[1 + i * 4]).toEqual(["docker", ["pull", "--platform", "linux/amd64", exact]]);
      expect(calls[2 + i * 4][1]).toEqual(["image", "inspect", exact]);
      expect(calls[3 + i * 4]).toEqual(["docker", ["tag", exact, image.target]]);
      expect(calls[4 + i * 4][1]).toEqual(["image", "inspect", image.target]);
    }
  });

  it.each([
    ["throttle", { code: 1, output: "toomanyrequests" }],
    ["denial", { code: 1, output: "unauthorized" }],
    ["disk", { code: 1, output: "no space left" }],
    ["cancellation", { code: 0, signal: "SIGTERM", output: "" }],
    ["timeout", { code: 0, timedOut: true, output: "" }],
  ])("stops on first %s without another download or startup", async (_, result) => {
    const h = harness();
    const original = h.run.getMockImplementation();
    h.run.mockImplementation((cmd, args, opts) => args[0] === "pull" ? result : original(cmd, args, opts));
    await expect(startSupabase(h)).rejects.toThrow("Image download failed");
    expect(h.run).toHaveBeenCalledTimes(2);
  });

  it.each(["architecture", "digest", "image ID", "invalid JSON", "alias"])("rejects %s mismatch before startup", async kind => {
    const h = harness();
    const original = h.run.getMockImplementation();
    h.run.mockImplementation(async (cmd, args, opts) => {
      const result = await original(cmd, args, opts);
      if (args[0] !== "image") return result;
      const isAlias = !args[2].includes("@");
      if (kind === "invalid JSON") return success("not json");
      const data = JSON.parse(result.output);
      if (kind === "architecture") data[0].Architecture = "arm64";
      if (kind === "digest") data[0].RepoDigests = [];
      if (kind === "image ID") data[0].Id = "invalid";
      if (kind === "alias" && isAlias) data[0].Id = `sha256:${"b".repeat(64)}`;
      return success(JSON.stringify(data));
    });
    await expect(startSupabase(h)).rejects.toThrow();
    expect(h.run.mock.calls.filter(call => call[1][0] === "pull")).toHaveLength(1);
    expect(h.run.mock.calls.some(call => call[1][0] === "start")).toBe(false);
  });

  it.each(["publisher", "target", "duplicate", "missing", "digest", "CLI", "platform", "registry"])("rejects an invalid %s plan before downloading", async kind => {
    const h = harness();
    if (kind === "publisher") h.candidate.images[0].source = h.candidate.images[0].source.replace("supabase", "untrusted");
    if (kind === "target") h.candidate.images[0].target += "-changed";
    if (kind === "duplicate") h.candidate.images[1] = h.candidate.images[0];
    if (kind === "missing") h.candidate.images.pop();
    if (kind === "digest") h.candidate.images[0].digest = "latest";
    if (kind === "CLI") h.candidate.cliVersion = "0.0.0";
    if (kind === "platform") h.candidate.platform = "linux/arm64";
    if (kind === "registry") h.registry = "other.invalid";
    await expect(startSupabase(h)).rejects.toThrow();
    expect(h.run).toHaveBeenCalledTimes(1);
  });

  it("retains startup failure without another attempt", async () => {
    const h = harness();
    const original = h.run.getMockImplementation();
    h.run.mockImplementation((cmd, args, opts) => args[0] === "start" ? { code: 2, output: "migration failure" } : original(cmd, args, opts));
    await expect(startSupabase(h)).rejects.toThrow("Supabase startup failed");
    expect(h.run.mock.calls.filter(call => call[1][0] === "start")).toHaveLength(1);
  });

  it("stops on a missing executable", async () => {
    const h = harness();
    h.run.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(startSupabase(h)).rejects.toThrow("ENOENT");
    expect(h.run).toHaveBeenCalledTimes(1);
  });

  it("bounds a real stalled subprocess and retains failure", async () => {
    const result = await runCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], { quiet: true, timeoutMs: 100 });
    expect(result.code).not.toBe(0);
    expect(result.timedOut).toBe(true);
  });

  it("keeps registry authentication, security gates and normal health checks", () => {
    for (const path of [".github/workflows/ci.yml", ".github/workflows/security.yml"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("node scripts/start-supabase-ci.mjs");
      expect(source).toContain("packages: read");
      expect(source).toContain("SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io");
      expect(source).not.toContain("--ignore-health-check");
      expect(source).toContain("Record image identities and remove registry credentials");
    }
  });
});
