#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const sourceRoots = ["app", "components", "hooks", "lib"];
const extraSourceFiles = ["next.config.ts"];
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const ignoredDirs = new Set([
  ".git",
  ".next",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const allowedFramerMotionFiles = new Set([
  "components/ui/background-scroll-animation.tsx",
]);
const allowedDndKitPrefixes = [
  "app/admin/",
  "components/admin/",
];
const allowedFfmpegReferenceFiles = new Set([
  "lib/server/ai-narration.ts",
  "next.config.ts",
]);
const allowedFfmpegTraceRoutes = new Set([
  "/api/admin/content",
  "/api/admin/content/[id]",
  "/api/admin/content/bulk",
  "/api/admin/content/[id]/narration",
  "/api/admin/narration/process",
]);

const importPattern =
  /(?:import\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\))/g;

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

function toRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function isClientFile(source) {
  return /^\s*(?:"use client"|'use client')\s*;/.test(source.slice(0, 512));
}

function getImports(source) {
  const imports = [];

  for (const match of source.matchAll(importPattern)) {
    imports.push(match[1] ?? match[2] ?? match[3]);
  }

  return imports;
}

function isDndKitImport(importSource) {
  return importSource === "@dnd-kit" || importSource.startsWith("@dnd-kit/");
}

function isAllowedDndKitFile(relativePath) {
  return allowedDndKitPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

function getTraceRoutes(nextConfigSource) {
  const outputFileTracingIncludesMatch = nextConfigSource.match(
    /outputFileTracingIncludes\s*:\s*\{(?<body>[\s\S]*?)\n\s*\}/
  );

  if (!outputFileTracingIncludesMatch?.groups?.body) {
    return [];
  }

  const routes = [];
  const routePattern =
    /["'](?<route>\/api\/[^"']+)["']\s*:\s*(?:ffmpegTraceIncludes|contentProcessingTraceIncludes)/g;

  for (const match of outputFileTracingIncludesMatch.groups.body.matchAll(routePattern)) {
    if (match.groups?.route) {
      routes.push(match.groups.route);
    }
  }

  return routes;
}

const files = [
  ...sourceRoots.flatMap((dir) => walk(path.join(rootDir, dir))),
  ...extraSourceFiles
    .map((file) => path.join(rootDir, file))
    .filter((file) => fs.existsSync(file)),
];
const failures = [];
const usage = {
  dndKit: [],
  ffmpegStatic: [],
  framerMotion: [],
};

for (const filePath of files) {
  const relativePath = toRelative(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  const imports = getImports(source);

  for (const importSource of imports) {
    if (importSource === "framer-motion") {
      usage.framerMotion.push(relativePath);

      if (!allowedFramerMotionFiles.has(relativePath)) {
        failures.push(
          `${relativePath} imports framer-motion. Keep framer-motion isolated to ${[...allowedFramerMotionFiles].join(", ")}.`
        );
      }
    }

    if (isDndKitImport(importSource)) {
      usage.dndKit.push(relativePath);

      if (!isAllowedDndKitFile(relativePath)) {
        failures.push(
          `${relativePath} imports ${importSource}. Keep @dnd-kit packages isolated to admin-only files.`
        );
      }
    }

    if (importSource === "ffmpeg-static" || importSource.startsWith("ffmpeg-static/")) {
      usage.ffmpegStatic.push(relativePath);

      if (!allowedFfmpegReferenceFiles.has(relativePath)) {
        failures.push(
          `${relativePath} imports ${importSource}. Keep ffmpeg-static behind server narration helpers and Next tracing config.`
        );
      }
    }
  }

  if (source.includes("ffmpeg-static")) {
    usage.ffmpegStatic.push(relativePath);

    if (!allowedFfmpegReferenceFiles.has(relativePath)) {
      failures.push(
        `${relativePath} references ffmpeg-static. Keep ffmpeg-static out of client/shared application code.`
      );
    }

    if (isClientFile(source)) {
      failures.push(`${relativePath} is a client file and references ffmpeg-static.`);
    }
  }
}

const nextConfigPath = path.join(rootDir, "next.config.ts");
if (fs.existsSync(nextConfigPath)) {
  const nextConfigSource = fs.readFileSync(nextConfigPath, "utf8");
  const traceRoutes = getTraceRoutes(nextConfigSource);
  const unexpectedTraceRoutes = traceRoutes.filter((route) => !allowedFfmpegTraceRoutes.has(route));
  const missingTraceRoutes = [...allowedFfmpegTraceRoutes].filter((route) => !traceRoutes.includes(route));

  if (unexpectedTraceRoutes.length > 0) {
    failures.push(
      `next.config.ts traces ffmpeg-static for unexpected routes: ${unexpectedTraceRoutes.join(", ")}.`
    );
  }

  if (missingTraceRoutes.length > 0) {
    failures.push(
      `next.config.ts is missing expected ffmpeg-static trace routes: ${missingTraceRoutes.join(", ")}.`
    );
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

console.log("Dependency isolation check");
console.log("==========================");
console.log(`framer-motion files: ${uniqueSorted(usage.framerMotion).join(", ") || "none"}`);
console.log(`@dnd-kit files: ${uniqueSorted(usage.dndKit).join(", ") || "none"}`);
console.log(`ffmpeg-static references: ${uniqueSorted(usage.ffmpegStatic).join(", ") || "none"}`);

if (failures.length > 0) {
  console.error("\nFailures:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("\nDependency isolation check passed.");
}
