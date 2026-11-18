import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const exception = JSON.parse(readFileSync(join(root, "scripts/security-audit-exceptions.json"), "utf8"));
const blockingSeverities = new Set(["high", "critical"]);
const severities = new Set(["info", "low", "moderate", "high", "critical"]);

export function assessAudit(report, installedVersions, now = new Date()) {
  if (!report || report.error || report.auditReportVersion !== 2 || !report.vulnerabilities
      || Array.isArray(report.vulnerabilities) || typeof report.vulnerabilities !== "object") {
    throw new Error("npm audit did not return a supported, complete vulnerability report");
  }

  const advisories = new Map();
  const resolved = new Map();
  function collect(name, chain = new Set()) {
    if (chain.has(name)) throw new Error(`Cyclic audit dependency at ${name}`);
    if (resolved.has(name)) return resolved.get(name);
    const finding = report.vulnerabilities[name];
    if (!finding || !Array.isArray(finding.via) || !Array.isArray(finding.nodes)
        || !severities.has(finding.severity) || finding.via.length === 0) {
      throw new Error(`Incomplete audit finding for ${name}`);
    }
    const next = new Set(chain).add(name);
    const leaves = finding.via.flatMap((via) => {
      if (typeof via === "string") return collect(via, next);
      if (!via || typeof via.url !== "string" || !severities.has(via.severity)) {
        throw new Error(`Unsupported advisory for ${name}`);
      }
      const advisory = { ...via, owner: name, nodes: finding.nodes };
      advisories.set(`${name}:${via.url}`, advisory);
      return [advisory];
    });
    if (blockingSeverities.has(finding.severity)
        && !leaves.some((leaf) => blockingSeverities.has(leaf.severity))) {
      throw new Error(`Unexplained blocking severity for ${name}`);
    }
    resolved.set(name, leaves);
    return leaves;
  }
  Object.keys(report.vulnerabilities).forEach((name) => collect(name));

  const versionsMatch = Object.entries(exception.reviewedVersions)
    .every(([path, version]) => installedVersions[path] === version);
  const exceptionActive = Number.isFinite(now.getTime())
    && now.getTime() < Date.parse(exception.expiresAt);
  const accepted = [];
  const blocking = [];
  for (const advisory of advisories.values()) {
    if (!blockingSeverities.has(advisory.severity)) continue;
    const matches = advisory.owner === exception.package && advisory.name === exception.package
      && advisory.url === exception.advisory && advisory.severity === "high"
      && advisory.nodes.length > 0
      && advisory.nodes.every((node) => exception.nodes.includes(node));
    if (matches && versionsMatch && exceptionActive) accepted.push(advisory.url);
    else blocking.push(`${advisory.owner}: ${advisory.url}`);
  }
  return { accepted, blocking };
}

function main() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["audit", "--omit=dev", "--audit-level=high", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error("npm audit could not complete; the security gate remains closed");
  }
  const report = JSON.parse(result.stdout);
  const installedVersions = Object.fromEntries(Object.keys(exception.reviewedVersions).map((path) => {
    const file = join(root, path, "package.json");
    const version = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).version : null;
    return [path, version];
  }));
  const assessment = assessAudit(report, installedVersions);
  for (const advisory of assessment.accepted) {
    console.log(`Time-limited exception: ${advisory}; expires ${exception.expiresAt}`);
  }
  for (const advisory of assessment.blocking) console.error(`Blocked: ${advisory}`);
  console.log(`Production audit evaluated. Blocking advisories: ${assessment.blocking.length}.`);
  process.exitCode = assessment.blocking.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Security audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
