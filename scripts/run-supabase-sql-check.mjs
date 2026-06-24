import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function runSupabaseSqlCheck(sqlFileName) {
  const sqlFile = join(root, "scripts", sqlFileName);

  if (!existsSync(sqlFile)) {
    console.error(`Missing SQL check file: ${sqlFile}`);
    process.exit(1);
  }

  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  const useLocal = /^(1|true|yes)$/i.test(process.env.SUPABASE_LOCAL ?? "");
  const args = ["db", "query", "--file", sqlFile, "--output", "json"];

  if (dbUrl) {
    args.push("--db-url", dbUrl);
  } else if (useLocal) {
    args.push("--local");
  } else {
    args.push("--linked");
  }

  const run = (command, commandArgs = args) =>
    spawnSync(command, commandArgs, {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    });

  let result = run("supabase");

  if (result.error?.code === "ENOENT") {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    result = run(npx, ["supabase", ...args]);
  }

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
}
