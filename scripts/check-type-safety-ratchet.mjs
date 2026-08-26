import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const roots = ["app", "components", "hooks", "lib"];
const extensions = new Set([".ts", ".tsx"]);
const ignoredSegments = new Set([
  "node_modules",
  ".next",
  "out",
  "build",
  "coverage",
]);

const allowedAsAnyCounts = new Map([
  ["app/admin/actions.ts", 1],
  ["app/admin/content/[id]/edit/page.tsx", 5],
  ["app/admin/page.tsx", 2],
  ["app/admin/requests/actions.ts", 2],
  ["app/api/admin/content/[id]/route.ts", 1],
  ["app/api/admin/content/bulk/route.ts", 1],
  ["app/api/admin/content/route.ts", 2],
  ["app/api/admin/embeddings/sync-segments/route.ts", 1],
  ["app/api/admin/embeddings/sync/route.ts", 1],
  ["app/api/admin/launch-readiness/route.ts", 1],
  ["app/api/chat/route.ts", 1],
  ["app/api/content-requests/[id]/vote/route.ts", 3],
  ["app/api/content-requests/route.ts", 2],
  ["app/api/feedback/content/route.ts", 1],
  ["app/api/notification-preferences/route.ts", 2],
  ["components/admin/ContentWorkbench.tsx", 1],
  ["components/admin/SyncSegmentEmbeddingsButton.tsx", 1],
  ["components/reader/SegmentAccordion.tsx", 1],
  ["components/ui/LibraryToolbar.tsx", 1],
  ["lib/server/admin-content-workbench.ts", 5],
  ["lib/server/content-request-notifications.ts", 9],
  ["lib/server/content-requests.ts", 10],
  ["lib/server/launch-readiness.ts", 2],
  ["lib/server/narration-estimate.ts", 2],
  ["lib/server/narration-processor.ts", 1],
  ["lib/server/user-library-repository.ts", 1],
  ["lib/server/user-topic-preferences-repository.ts", 1],
]);

const maxTsExpectErrorCount = 3;

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (ignoredSegments.has(entry)) {
      continue;
    }

    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (!extensions.has(path.extname(entry))) {
      continue;
    }

    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) {
      continue;
    }

    if (fullPath.split(path.sep).includes("__tests__")) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function countMatches(content, pattern) {
  return content.match(pattern)?.length ?? 0;
}

const files = roots.flatMap((root) => walk(root));
const asAnyCounts = new Map();
let tsExpectErrorCount = 0;
const tsIgnoreFiles = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const relativePath = file.split(path.sep).join("/");
  const asAnyCount = countMatches(content, /\bas\s+any\b/g);

  if (asAnyCount > 0) {
    asAnyCounts.set(relativePath, asAnyCount);
  }

  tsExpectErrorCount += countMatches(content, /@ts-expect-error/g);

  if (content.includes("@ts-ignore")) {
    tsIgnoreFiles.push(relativePath);
  }
}

const failures = [];

for (const [file, count] of asAnyCounts) {
  const allowedCount = allowedAsAnyCounts.get(file);
  if (allowedCount === undefined) {
    failures.push(
      `${file} contains ${count} "as any" cast(s) but is not in the allowlist.`,
    );
    continue;
  }

  if (count > allowedCount) {
    failures.push(
      `${file} contains ${count} "as any" cast(s); baseline allows ${allowedCount}.`,
    );
  }
}

for (const file of allowedAsAnyCounts.keys()) {
  if (!asAnyCounts.has(file)) {
    console.log(
      `Type-safety ratchet: ${file} no longer contains "as any"; remove it from the allowlist.`,
    );
  }
}

if (tsExpectErrorCount > maxTsExpectErrorCount) {
  failures.push(
    `Found ${tsExpectErrorCount} @ts-expect-error directives; baseline allows ${maxTsExpectErrorCount}.`,
  );
}

for (const file of tsIgnoreFiles) {
  failures.push(
    `${file} contains @ts-ignore. Use @ts-expect-error with a reason or fix the type.`,
  );
}

if (failures.length > 0) {
  console.error("Type-safety ratchet failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Type-safety ratchet passed: ${asAnyCounts.size} allowed files with "as any", ${tsExpectErrorCount} @ts-expect-error directive(s), 0 @ts-ignore.`,
);
