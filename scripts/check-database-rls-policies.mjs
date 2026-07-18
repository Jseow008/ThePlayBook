import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const useLocal = /^(1|true|yes)$/i.test(process.env.SUPABASE_LOCAL ?? "");
const disposableDbUrl = process.env.DB103_TEST_DB_URL?.trim();

if (!useLocal && !disposableDbUrl) {
  console.error(
    "Refusing to run the DB-103 role matrix against a linked database. "
      + "Set SUPABASE_LOCAL=1 or provide DB103_TEST_DB_URL for an explicitly disposable database.",
  );
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sql = readFileSync(join(root, "scripts", "database-rls-policy-check.sql"), "utf8");

const listedContainers = spawnSync(
  "docker",
  ["ps", "--format", "{{.Names}}"],
  { cwd: root, encoding: "utf8" },
);

if (listedContainers.error || listedContainers.status !== 0) {
  process.stderr.write(listedContainers.stderr ?? "");
  console.error("DB-103 role matrix requires a running local Supabase database container.");
  process.exit(listedContainers.status ?? 1);
}

const databaseContainers = listedContainers.stdout
  .split(/\r?\n/)
  .filter((name) => name.startsWith("supabase_db_"));

const configuredContainer = process.env.SUPABASE_DB_CONTAINER?.trim();
const container = configuredContainer || (databaseContainers.length === 1 ? databaseContainers[0] : "");

if (!container) {
  console.error(
    "Could not select one local Supabase database container. "
      + "Set SUPABASE_DB_CONTAINER explicitly.",
  );
  process.exit(1);
}

const connectionArgs = disposableDbUrl
  ? [disposableDbUrl]
  : ["-U", "postgres", "-d", "postgres"];

const result = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    container,
    "psql",
    ...connectionArgs,
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
  ],
  {
    cwd: root,
    encoding: "utf8",
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  },
);

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
