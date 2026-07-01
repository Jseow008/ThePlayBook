import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const roots = ["app", "lib"];
const extensions = new Set([".ts", ".tsx"]);
const ignoredSegments = new Set(["node_modules", ".next", "out", "build", "coverage", "__tests__"]);

const allowedDirectRevalidationFiles = new Set([
  "app/admin/requests/actions.ts",
  "app/api/admin/sections/[id]/route.ts",
  "app/api/admin/sections/route.ts",
  "lib/actions/auth.ts",
  "lib/server/revalidation.ts",
]);

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

    files.push(fullPath);
  }

  return files;
}

const failures = [];

for (const file of roots.flatMap((root) => walk(root))) {
  const content = readFileSync(file, "utf8");
  if (!content.includes("revalidatePath")) {
    continue;
  }

  const relativePath = file.split(path.sep).join("/");
  if (!allowedDirectRevalidationFiles.has(relativePath)) {
    failures.push(`${relativePath} imports or calls revalidatePath outside the cache policy allowlist.`);
  }
}

if (failures.length > 0) {
  console.error("Revalidation boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error("Use lib/server/revalidation.ts for content-item/public-content invalidation, or update docs/CACHE_REVALIDATION_POLICY.md and this allowlist for a deliberate exception.");
  process.exit(1);
}

console.log(`Revalidation boundary check passed: ${allowedDirectRevalidationFiles.size} direct revalidatePath exception(s) allowed.`);
