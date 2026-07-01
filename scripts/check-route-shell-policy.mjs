import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const docsPath = "docs/ROUTE_SHELL_POLICY.md";
const policyPath = "lib/route-chrome-policy.ts";
const publicRoot = path.join("app", "(public)");
const standalonePageFiles = [
  "app/page.tsx",
  "app/login/page.tsx",
  "app/admin-login/page.tsx",
  "app/chat-export/[id]/page.tsx",
];

function walk(dir, files = []) {
  if (!existsSync(dir)) {
    return files;
  }

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (entry === "page.tsx" || entry === "page.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

function routePatternFromPage(file, rootPrefix) {
  const relativePath = path.relative(rootPrefix, path.dirname(file));
  const segments = relativePath
    .split(path.sep)
    .filter(Boolean);

  if (segments.length === 0) {
    return "/";
  }

  const firstDynamicIndex = segments.findIndex((segment) => segment.startsWith("["));
  const routeSegments =
    firstDynamicIndex === -1
      ? segments
      : [...segments.slice(0, firstDynamicIndex), "*"];

  return `/${routeSegments.join("/")}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertDocumentedRoute(doc, route) {
  // Route entries are intentionally required to be backtick-delimited so the
  // policy doc keeps one canonical, machine-checkable route format.
  const pattern = new RegExp(`(^|[^\\w/])\`${escapeRegExp(route)}\`([^\\w/]|$)`);
  return pattern.test(doc);
}

const docs = readFileSync(docsPath, "utf8");
const policySource = readFileSync(policyPath, "utf8");
const failures = [];

const publicRoutePatterns = [...new Set(walk(publicRoot).map((file) => routePatternFromPage(file, publicRoot)))]
  .sort((a, b) => a.localeCompare(b));

for (const route of publicRoutePatterns) {
  if (!assertDocumentedRoute(docs, route)) {
    failures.push(`${route} is a public-shell page route but is missing from ${docsPath}.`);
  }
}

for (const file of standalonePageFiles) {
  if (!existsSync(file)) {
    failures.push(`${file} is listed as a standalone shell route but no longer exists.`);
    continue;
  }

  const route = routePatternFromPage(file, "app");
  if (!assertDocumentedRoute(docs, route)) {
    failures.push(`${route} is a standalone page route but is missing from ${docsPath}.`);
  }
}

const specialPolicyPatterns = [...policySource.matchAll(/pattern:\s*"([^"]+)"/g)]
  .map((match) => match[1])
  .sort((a, b) => a.localeCompare(b));

for (const route of specialPolicyPatterns) {
  if (!assertDocumentedRoute(docs, route)) {
    failures.push(`${route} is a special route chrome policy but is missing from ${docsPath}.`);
  }
}

if (!docs.includes("Routes Governed by `getRouteChromePolicy`")) {
  failures.push(`${docsPath} must separate routes governed by getRouteChromePolicy from other shells.`);
}

if (!docs.includes("Standalone Routes Outside `PublicLayoutShell`")) {
  failures.push(`${docsPath} must document standalone routes outside PublicLayoutShell.`);
}

if (!docs.includes("Admin Routes")) {
  failures.push(`${docsPath} must document admin routes as a separate shell.`);
}

if (failures.length > 0) {
  console.error("Route shell policy check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(`Update ${docsPath}, ${policyPath}, or the route location so shell ownership stays explicit.`);
  process.exit(1);
}

console.log(
  `Route shell policy check passed: ${publicRoutePatterns.length} public route pattern(s), ${standalonePageFiles.length} standalone route(s), ${specialPolicyPatterns.length} special policy pattern(s) documented.`
);
