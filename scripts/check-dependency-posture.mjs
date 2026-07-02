#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");
const shouldPrintOutdated = process.argv.includes("--outdated");

const trackedGroups = [
  {
    tier: "Tier 1",
    area: "Next.js",
    packages: ["next", "@next/bundle-analyzer", "eslint-config-next"],
  },
  {
    tier: "Tier 1",
    area: "React",
    packages: ["react", "react-dom", "@types/react", "@types/react-dom"],
  },
  {
    tier: "Tier 1",
    area: "TypeScript",
    packages: ["typescript"],
  },
  {
    tier: "Tier 1",
    area: "Tailwind/PostCSS",
    packages: [
      "tailwindcss",
      "@tailwindcss/postcss",
      "@tailwindcss/typography",
      "postcss",
    ],
  },
  {
    tier: "Tier 1",
    area: "Sentry",
    packages: ["@sentry/nextjs"],
  },
  {
    tier: "Tier 1",
    area: "Supabase",
    packages: ["@supabase/supabase-js", "@supabase/ssr", "supabase"],
  },
  {
    tier: "Tier 1",
    area: "AI SDK",
    packages: [
      "ai",
      "@ai-sdk/react",
      "@ai-sdk/openai",
      "@ai-sdk/anthropic",
      "@google/genai",
    ],
  },
  {
    tier: "Tier 1",
    area: "Playwright",
    packages: ["@playwright/test"],
  },
  {
    tier: "Tier 1",
    area: "Vitest",
    packages: ["vitest", "jsdom"],
  },
  {
    tier: "Tier 2",
    area: "Data fetching",
    packages: ["@tanstack/react-query"],
  },
  {
    tier: "Tier 2",
    area: "Analytics",
    packages: [
      "posthog-js",
      "posthog-node",
      "@vercel/analytics",
      "@vercel/speed-insights",
    ],
  },
  {
    tier: "Tier 2",
    area: "Rate limiting/cache",
    packages: ["@upstash/ratelimit", "@upstash/redis"],
  },
  {
    tier: "Tier 2",
    area: "UI libraries",
    packages: ["lucide-react", "@phosphor-icons/react", "sonner", "qrcode.react"],
  },
  {
    tier: "Tier 2",
    area: "Content/rendering",
    packages: [
      "date-fns",
      "react-markdown",
      "rehype-raw",
      "rehype-sanitize",
      "remark-breaks",
      "remark-gfm",
      "zod",
    ],
  },
  {
    tier: "Tier 2",
    area: "State/utilities",
    packages: ["zustand", "clsx", "tailwind-merge", "server-only", "tsx"],
  },
  {
    tier: "Tier 2",
    area: "Testing/tooling",
    packages: [
      "eslint",
      "@types/node",
      "@testing-library/dom",
      "@testing-library/jest-dom",
      "@testing-library/react",
      "@testing-library/user-event",
      "dotenv",
    ],
  },
  {
    tier: "Special watch",
    area: "Low-use/heavy dependencies",
    packages: ["framer-motion", "ffmpeg-static", "@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
  },
];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${path.relative(rootDir, filePath)}: ${error.message}`);
  }
}

function getPackageSource(packageJson, packageName) {
  const sections = ["dependencies", "devDependencies", "overrides"];

  for (const section of sections) {
    if (Object.hasOwn(packageJson[section] ?? {}, packageName)) {
      return {
        section,
        range: packageJson[section][packageName],
      };
    }
  }

  return null;
}

function getResolvedVersion(packageLock, packageName) {
  const packageEntry = packageLock?.packages?.[`node_modules/${packageName}`];
  return packageEntry?.version ?? null;
}

function formatRows(rows) {
  const headers = ["Tier", "Area", "Package", "Source", "Range", "Resolved"];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );

  const formatRow = (row) =>
    row.map((cell, index) => cell.padEnd(widths[index])).join("  ");

  console.log(formatRow(headers));
  console.log(formatRow(widths.map((width) => "-".repeat(width))));
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

function printOutdatedReport() {
  console.log("\nOutdated dependency report");
  console.log("--------------------------");

  try {
    const output = execFileSync("npm", ["outdated", "--json", "--long"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    console.log(output.trim() || "No outdated dependencies reported.");
  } catch (error) {
    const output = `${error.stdout ?? ""}`.trim();
    const stderr = `${error.stderr ?? ""}`.trim();

    if (output) {
      console.log(output);
      return;
    }

    if (stderr) {
      console.warn(stderr);
      console.warn("Could not fetch npm outdated data. This report is informational only.");
      return;
    }

    console.warn("Could not fetch npm outdated data. This report is informational only.");
  }
}

let packageJson;
let packageLock;

try {
  packageJson = readJson(packageJsonPath);
  packageLock = fs.existsSync(packageLockPath) ? readJson(packageLockPath) : null;
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const rows = [];
const missingPackages = [];

for (const group of trackedGroups) {
  for (const packageName of group.packages) {
    const source = getPackageSource(packageJson, packageName);

    if (!source) {
      missingPackages.push(`${packageName} (${group.tier}, ${group.area})`);
      rows.push([group.tier, group.area, packageName, "missing", "-", "-"]);
      continue;
    }

    rows.push([
      group.tier,
      group.area,
      packageName,
      source.section,
      source.range,
      getResolvedVersion(packageLock, packageName) ?? "not in lockfile",
    ]);
  }
}

console.log("Dependency posture");
console.log("==================");
formatRows(rows);

if (missingPackages.length > 0) {
  console.error("\nMissing tracked packages:");
  for (const packageName of missingPackages) {
    console.error(`- ${packageName}`);
  }
  process.exit(1);
}

if (shouldPrintOutdated) {
  printOutdatedReport();
}

console.log("\nDependency posture check passed.");
