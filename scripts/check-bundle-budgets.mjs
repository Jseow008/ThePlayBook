#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const nextDir = path.join(rootDir, ".next");
const budgetsPath = path.join(rootDir, "docs/performance/bundle-budgets.json");
const routeBundleStatsPath = path.join(nextDir, "diagnostics/route-bundle-stats.json");
const buildManifestPath = path.join(nextDir, "build-manifest.json");
const writeBaseline = process.argv.includes("--write-baseline");

const defaultTrackedRoutes = {
  "/": {
    nextRoute: "/",
    clientReferenceRoute: "/page",
  },
  "/browse": {
    nextRoute: "/browse",
    clientReferenceRoute: "/(public)/browse/page",
  },
  "/read/[id]": {
    nextRoute: "/read/[id]/[[...slug]]",
    clientReferenceRoute: "/(public)/read/[id]/[[...slug]]/page",
  },
  "/notes": {
    nextRoute: "/notes",
    clientReferenceRoute: "/(public)/notes/page",
  },
  "/focus": {
    nextRoute: "/focus",
    clientReferenceRoute: "/(public)/focus/page",
  },
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  const kib = bytes / 1024;
  if (kib < 1024) return `${Math.round(kib)} KiB`;
  return `${(kib / 1024).toFixed(2)} MiB`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getFileSizeFromNext(relativePath) {
  const normalizedPath = relativePath
    .replace(/^\/_next\//, "")
    .replace(/^\.next\//, "");
  const filePath = path.join(nextDir, normalizedPath);
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}

function parseClientReferenceManifest(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const assignmentMatch = source.match(/globalThis\.__RSC_MANIFEST\[(.*?)\]\s*=\s*/s);
  const valueEnd = source.lastIndexOf(";");

  if (!assignmentMatch || typeof assignmentMatch.index !== "number" || valueEnd === -1) {
    throw new Error(`Could not parse ${path.relative(rootDir, filePath)}.`);
  }

  const routeKey = JSON.parse(assignmentMatch[1]);
  const valueStart = assignmentMatch.index + assignmentMatch[0].length;
  const manifest = JSON.parse(source.slice(valueStart, valueEnd));

  return { routeKey, manifest };
}

function addJsChunksFromClientReferenceManifest(chunks, manifest) {
  for (const moduleRef of Object.values(manifest.clientModules ?? {})) {
    for (const chunk of moduleRef.chunks ?? []) {
      if (typeof chunk === "string" && chunk.endsWith(".js")) {
        chunks.add(chunk);
      }
    }
  }
}

function readTurbopackRouteStats() {
  if (!fs.existsSync(routeBundleStatsPath)) return null;

  const stats = readJson(routeBundleStatsPath);
  if (!Array.isArray(stats)) {
    throw new Error(`${path.relative(rootDir, routeBundleStatsPath)} must contain an array.`);
  }

  return {
    source: ".next/diagnostics/route-bundle-stats.json",
    metric: "firstLoadUncompressedJsBytes",
    routes: new Map(
      stats
        .filter((entry) => typeof entry.route === "string")
        .map((entry) => [entry.route, {
          route: entry.route,
          value: entry.firstLoadUncompressedJsBytes,
          chunks: entry.firstLoadChunkPaths ?? [],
        }])
    ),
  };
}

function readWebpackClientReferenceStats() {
  if (!fs.existsSync(buildManifestPath)) {
    throw new Error(
      "Missing Next build output. Run `npm run build` or `npm run analyze:ci` before checking bundle budgets."
    );
  }

  const buildManifest = readJson(buildManifestPath);
  const rootChunks = new Set([
    ...(buildManifest.polyfillFiles ?? []),
    ...(buildManifest.rootMainFiles ?? []),
  ].filter((chunk) => typeof chunk === "string" && chunk.endsWith(".js")));

  const routeStats = new Map();
  const manifestFiles = [];
  const appServerDir = path.join(nextDir, "server/app");

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith("_client-reference-manifest.js")) {
        manifestFiles.push(fullPath);
      }
    }
  }

  if (fs.existsSync(appServerDir)) {
    walk(appServerDir);
  }

  for (const manifestFile of manifestFiles) {
    const { routeKey, manifest } = parseClientReferenceManifest(manifestFile);
    const chunks = new Set(rootChunks);
    addJsChunksFromClientReferenceManifest(chunks, manifest);

    let totalBytes = 0;
    for (const chunk of chunks) {
      totalBytes += getFileSizeFromNext(chunk);
    }

    routeStats.set(routeKey, {
      route: routeKey,
      value: totalBytes,
      chunks: [...chunks],
    });
  }

  return {
    source: ".next/server/app/*_client-reference-manifest.js",
    metric: "clientReferenceManifestJsBytes",
    routes: routeStats,
  };
}

function readRouteStats(preferredMetric = null) {
  if (preferredMetric === "firstLoadUncompressedJsBytes") {
    const stats = readTurbopackRouteStats();
    if (!stats) {
      throw new Error(
        "Current budget expects Turbopack route diagnostics, but .next/diagnostics/route-bundle-stats.json was not found."
      );
    }
    return stats;
  }

  if (preferredMetric === "clientReferenceManifestJsBytes") {
    return readWebpackClientReferenceStats();
  }

  return readTurbopackRouteStats() ?? readWebpackClientReferenceStats();
}

function getRouteStat(stats, budgetRoute, config) {
  const keys = [
    config.nextRoute,
    config.clientReferenceRoute,
    budgetRoute,
  ].filter(Boolean);

  for (const key of keys) {
    const stat = stats.routes.get(key);
    if (stat && Number.isFinite(stat.value)) return stat;
  }

  return null;
}

function buildBudgetsFromStats(stats, existingBudgets = null) {
  const thresholds = existingBudgets?.thresholds ?? {
    warnPercent: 10,
    failPercent: 20,
  };
  const routeConfig = existingBudgets?.routes ?? defaultTrackedRoutes;
  const routes = {};

  for (const [budgetRoute, config] of Object.entries(routeConfig)) {
    const stat = getRouteStat(stats, budgetRoute, config);

    if (!stat) {
      throw new Error(`No ${stats.metric} stat found for ${budgetRoute}.`);
    }

    routes[budgetRoute] = {
      nextRoute: config.nextRoute ?? budgetRoute,
      clientReferenceRoute: config.clientReferenceRoute,
      baselineBytes: stat.value,
      warnAtBytes: Math.ceil(stat.value * (1 + thresholds.warnPercent / 100)),
      failAtBytes: Math.ceil(stat.value * (1 + thresholds.failPercent / 100)),
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    source: stats.source,
    metric: stats.metric,
    unit: "bytes",
    thresholds,
    routes,
  };
}

function writeBudgetFile(budgets) {
  fs.mkdirSync(path.dirname(budgetsPath), { recursive: true });
  fs.writeFileSync(budgetsPath, `${JSON.stringify(budgets, null, 2)}\n`);
  console.log(`Wrote ${path.relative(rootDir, budgetsPath)}.`);
}

function loadBudgets() {
  if (!fs.existsSync(budgetsPath)) {
    throw new Error(
      `Missing ${path.relative(rootDir, budgetsPath)}. Run \`node scripts/check-bundle-budgets.mjs --write-baseline\` after a build to create it.`
    );
  }

  const budgets = readJson(budgetsPath);
  if (!budgets || typeof budgets !== "object" || !budgets.routes) {
    throw new Error(`${path.relative(rootDir, budgetsPath)} is missing a routes object.`);
  }

  return budgets;
}

function checkBudgets(stats, budgets) {
  if (budgets.metric !== stats.metric) {
    throw new Error(
      `Budget metric is ${budgets.metric}, but current build produced ${stats.metric}. Recreate the baseline with \`node scripts/check-bundle-budgets.mjs --write-baseline\`.`
    );
  }

  const failures = [];
  const warnings = [];
  const rows = [];

  for (const [budgetRoute, budget] of Object.entries(budgets.routes)) {
    const stat = getRouteStat(stats, budgetRoute, budget);

    if (!stat) {
      failures.push(`Missing route stat for ${budgetRoute}.`);
      continue;
    }

    const current = stat.value;
    const warnAt = budget.warnAtBytes;
    const failAt = budget.failAtBytes;

    rows.push({
      budgetRoute,
      current,
      warnAt,
      failAt,
    });

    if (Number.isFinite(failAt) && current > failAt) {
      failures.push(
        `${budgetRoute} is ${formatBytes(current)}, above fail budget ${formatBytes(failAt)}.`
      );
    } else if (Number.isFinite(warnAt) && current > warnAt) {
      warnings.push(
        `${budgetRoute} is ${formatBytes(current)}, above warning budget ${formatBytes(warnAt)}.`
      );
    }
  }

  console.log(`Bundle budget check (${stats.metric} from ${stats.source}):`);
  for (const row of rows) {
    console.log(
      `- ${row.budgetRoute}: ${formatBytes(row.current)} (warn ${formatBytes(row.warnAt)}, fail ${formatBytes(row.failAt)})`
    );
  }

  if (warnings.length > 0) {
    console.warn("\nWarnings:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

try {
  if (writeBaseline) {
    const existingBudgets = fs.existsSync(budgetsPath) ? readJson(budgetsPath) : null;
    const stats = readRouteStats(existingBudgets?.metric);
    writeBudgetFile(buildBudgetsFromStats(stats, existingBudgets));
  } else {
    const budgets = loadBudgets();
    const stats = readRouteStats(budgets.metric);
    checkBudgets(stats, budgets);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
