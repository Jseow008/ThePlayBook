#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const baselinePath = path.join(rootDir, "docs/performance/client-boundaries.json");
const writeBaseline = process.argv.includes("--write-baseline");
const strict = process.env.CLIENT_BOUNDARY_STRICT === "true";
const scannedDirs = ["app", "components", "hooks", "lib"];
const ignoredDirs = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "playwright-report",
  "test-results",
]);
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function isClientFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8").slice(0, 512);
  return /^\s*(?:"use client"|'use client')\s*;/.test(source);
}

function getClientFiles() {
  return scannedDirs
    .flatMap((dir) => walk(path.join(rootDir, dir)))
    .filter(isClientFile)
    .map((filePath) => {
      const stats = fs.statSync(filePath);
      return {
        path: path.relative(rootDir, filePath),
        bytes: stats.size,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function formatBytes(bytes) {
  const kib = bytes / 1024;
  return kib < 1024 ? `${Math.round(kib)} KiB` : `${(kib / 1024).toFixed(2)} MiB`;
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) return null;
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function writeClientBoundaryBaseline(clientFiles) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalClientFiles: clientFiles.length,
        files: clientFiles.map((file) => file.path),
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${path.relative(rootDir, baselinePath)}.`);
}

const clientFiles = getClientFiles();

if (writeBaseline) {
  writeClientBoundaryBaseline(clientFiles);
  process.exit(0);
}

const largestFiles = [...clientFiles].sort((a, b) => b.bytes - a.bytes).slice(0, 12);
const baseline = readBaseline();
const baselineFiles = new Set(baseline?.files ?? []);
const newClientFiles = baseline ? clientFiles.filter((file) => !baselineFiles.has(file.path)) : [];

console.log(`Client boundary check: ${clientFiles.length} "use client" files.`);

if (baseline) {
  console.log(`Baseline: ${baseline.totalClientFiles} files from ${baseline.generatedAt}.`);
}

console.log("\nLargest client-marked files:");
for (const file of largestFiles) {
  console.log(`- ${file.path}: ${formatBytes(file.bytes)}`);
}

if (!baseline) {
  console.log(
    "\nNo client-boundary baseline found. Run `node scripts/check-client-boundaries.mjs --write-baseline` to create one."
  );
} else if (newClientFiles.length > 0) {
  console.log("\nNew client-marked files since baseline:");
  for (const file of newClientFiles) {
    console.log(`- ${file.path}`);
  }

  if (strict) {
    console.error("\nCLIENT_BOUNDARY_STRICT=true: new client boundaries require review.");
    process.exitCode = 1;
  }
}
