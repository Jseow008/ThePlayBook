import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

if (!/^(1|true|yes)$/i.test(process.env.SUPABASE_LOCAL ?? "")) {
  console.error("DB-107 only runs against the disposable local Supabase database.");
  process.exit(1);
}

const containers = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" });
const container = containers.stdout.split(/\r?\n/).find((name) => name.startsWith("supabase_db_"));
if (!container) {
  console.error("DB-107 requires the disposable local Supabase database container.");
  process.exit(1);
}
const password = process.env.DB107_WORKER_PASSWORD;
if (!password) {
  console.error("DB-107 requires a job-local worker password for the disposable database.");
  process.exit(1);
}
const setup = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "--set", "ON_ERROR_STOP=1"], {
  encoding: "utf8",
  input: `ALTER ROLE netflux_snapshot_worker PASSWORD '${password.replaceAll("'", "''")}';`,
});
if (setup.status !== 0) {
  process.stderr.write(setup.stderr ?? "");
  process.exit(setup.status ?? 1);
}
const sql = readFileSync(new URL("./database-account-data-snapshot-check.sql", import.meta.url), "utf8");
const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "--set", "ON_ERROR_STOP=1"], {
  encoding: "utf8",
  input: sql,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(result.status ?? 1);
