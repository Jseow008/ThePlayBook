#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(root, "supabase", "migrations");
const checkRemote = process.argv.includes("--remote");
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const versions = migrationFiles.map((file) => file.split("_", 1)[0]);
const migrationsByVersion = new Map(migrationFiles.map((file, index) => [
  versions[index],
  readFileSync(join(migrationsDir, file), "utf8"),
]));
const invalidFiles = migrationFiles.filter((file, index) => !/^\d+$/.test(versions[index]));
const versionCounts = new Map();

for (const version of versions) {
  versionCounts.set(version, (versionCounts.get(version) ?? 0) + 1);
}

const duplicateVersions = [...versionCounts]
  .filter(([, count]) => count > 1)
  .map(([version]) => version);

if (invalidFiles.length > 0 || duplicateVersions.length > 0) {
  console.error(JSON.stringify({
    status: "invalid",
    invalid_files: invalidFiles,
    duplicate_versions: duplicateVersions,
  }, null, 2));
  process.exit(1);
}

if (!checkRemote) {
  console.log(JSON.stringify({
    status: "valid",
    migration_files: migrationFiles.length,
    unique_versions: versions.length,
  }, null, 2));
  process.exit(0);
}

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const targetArgs = dbUrl ? ["--db-url", dbUrl] : ["--linked"];
const result = spawnSync(
  "npx",
  [
    "supabase",
    "db",
    "query",
    "SELECT version, statements FROM supabase_migrations.schema_migrations ORDER BY version;",
    "--output",
    "json",
    ...targetArgs,
  ],
  {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  },
);

if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const payload = JSON.parse(result.stdout);
const remoteRows = payload.rows;
const remoteVersions = remoteRows?.map((row) => row.version);

if (!Array.isArray(remoteVersions)) {
  throw new Error("Remote migration query did not return a rows array");
}

const localSet = new Set(versions);
const remoteSet = new Set(remoteVersions);
const localOnly = versions.filter((version) => !remoteSet.has(version));
const remoteOnly = remoteVersions.filter((version) => !localSet.has(version));

if (localOnly.length > 0 || remoteOnly.length > 0 || remoteSet.size !== remoteVersions.length) {
  console.error(JSON.stringify({
    status: "different",
    local_only: localOnly,
    remote_only: remoteOnly,
    remote_duplicate_count: remoteVersions.length - remoteSet.size,
  }, null, 2));
  process.exit(1);
}

const normalizeSql = (sql) => sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--.*$/gm, "")
  .replace(/[;\s]+/g, "")
  .trim();

const contentDrift = remoteRows
  .filter((row) => {
    if (!Array.isArray(row.statements)) return true;
    const localSql = migrationsByVersion.get(row.version);
    const recordedSql = row.statements.join(";\n");
    return normalizeSql(localSql) !== normalizeSql(recordedSql);
  })
  .map((row) => row.version);

if (contentDrift.length > 0) {
  console.error(JSON.stringify({
    status: "different",
    recorded_sql_drift: contentDrift,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "match",
  local_versions: versions.length,
  remote_versions: remoteVersions.length,
  recorded_sql_matches: remoteVersions.length,
}, null, 2));
