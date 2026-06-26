import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function printUsage() {
  console.log(`Usage: npm run verify:production -- --base-url <url> [--env-file <path>] [--skip-browser]

Runs the production readiness checklist:
  - production dependency audit
  - launch environment validation
  - Supabase advisor and SQL security checks
  - lint, typecheck, unit/security tests, build
  - browser smoke tests against the supplied deployment URL

Browser smoke tests require HEALTH_CHECK_SECRET, SMOKE_ADMIN_EMAIL,
SMOKE_ADMIN_PASSWORD, and SMOKE_READ_PATH unless --skip-browser is set.`);
}

function parseArgs(argv) {
  const args = {
    baseUrl: "",
    envFile: "",
    skipBrowser: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--skip-browser") {
      args.skipBrowser = true;
      continue;
    }

    if (arg === "--base-url") {
      args.baseUrl = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--base-url=")) {
      args.baseUrl = arg.slice("--base-url=".length);
      continue;
    }

    if (arg === "--env-file") {
      args.envFile = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--env-file=")) {
      args.envFile = arg.slice("--env-file=".length);
      continue;
    }

    console.error(`Unknown argument: ${arg}`);
    printUsage();
    process.exit(1);
  }

  return args;
}

function requireEnv(names, context) {
  const missing = names.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    console.error(`${context} is missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

function npmBin() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxBin() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function runStep(name, command, args, extraEnv = {}) {
  console.log(`\n==> ${name}`);

  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.envFile) {
  const envPath = resolve(root, args.envFile);

  if (!existsSync(envPath)) {
    console.error(`Environment file not found: ${envPath}`);
    process.exit(1);
  }

  const result = loadDotenv({ path: envPath, override: false });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
}

if (!args.skipBrowser) {
  if (!args.baseUrl) {
    console.error("--base-url is required unless --skip-browser is set.");
    printUsage();
    process.exit(1);
  }

  try {
    const parsed = new URL(args.baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    console.error(`Invalid --base-url: ${args.baseUrl}`);
    process.exit(1);
  }

  requireEnv(
    ["HEALTH_CHECK_SECRET", "SMOKE_ADMIN_EMAIL", "SMOKE_ADMIN_PASSWORD", "SMOKE_READ_PATH"],
    "Production browser smoke verification",
  );
}

requireEnv(["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF"], "Supabase advisor verification");
requireEnv(["SUPABASE_DB_URL"], "Production Supabase SQL verification");

const npm = npmBin();
const npx = npxBin();
const launchEnvArgs = args.envFile
  ? ["run", "validate:launch-env", "--", "--env-file", args.envFile]
  : ["run", "validate:launch-env"];

runStep("Production dependency audit", npm, ["run", "security:audit"]);
runStep("Launch environment validation", npm, launchEnvArgs);
runStep("Supabase security advisors", npm, ["run", "security:supabase-advisors"]);
runStep("Admin RPC ACL SQL check", npm, ["run", "security:admin-rpc-acls"]);
runStep("SECURITY DEFINER ACL SQL check", npm, ["run", "security:function-acls"]);
runStep("Embedding table read SQL check", npm, ["run", "security:embedding-table-reads"]);
runStep("Storage bucket listing SQL check", npm, ["run", "security:storage-bucket-listing"]);
runStep("Analytics RLS SQL check", npm, ["run", "security:analytics-rls"]);
runStep("Lint", npm, ["run", "lint"]);
runStep("Typecheck", npm, ["run", "typecheck"]);
runStep("Tests", npm, ["run", "test"]);
runStep("Build", npm, ["run", "build"]);

if (!args.skipBrowser) {
  runStep(
    "Production browser smoke tests",
    npx,
    ["playwright", "test", "tests/e2e/production-smoke.spec.ts", "--project=chromium"],
    {
      PLAYWRIGHT_BASE_URL: args.baseUrl,
      PRODUCTION_SMOKE_BASE_URL: args.baseUrl,
    },
  );
}

console.log("\nProduction verification completed successfully.");
