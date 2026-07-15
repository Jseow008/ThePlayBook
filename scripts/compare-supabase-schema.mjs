import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sqlFile = join(root, "scripts", "database-schema-fingerprint.sql");
const workdirFlagIndex = process.argv.indexOf("--local-workdir");
const candidateWorkdirFlagIndex = process.argv.indexOf("--candidate-workdir");
const localWorkdir =
  workdirFlagIndex >= 0
    ? resolve(process.argv[workdirFlagIndex + 1] ?? "")
    : root;
const candidateWorkdir =
  candidateWorkdirFlagIndex >= 0
    ? resolve(process.argv[candidateWorkdirFlagIndex + 1] ?? "")
    : "";

if (workdirFlagIndex >= 0 && !process.argv[workdirFlagIndex + 1]) {
  console.error("--local-workdir requires a path");
  process.exit(2);
}

if (
  candidateWorkdirFlagIndex >= 0 &&
  !process.argv[candidateWorkdirFlagIndex + 1]
) {
  console.error("--candidate-workdir requires a path");
  process.exit(2);
}

if (workdirFlagIndex >= 0 && candidateWorkdirFlagIndex >= 0) {
  console.error("Use either --local-workdir or --candidate-workdir, not both");
  process.exit(2);
}

const comparisonTarget = candidateWorkdir ? "candidate" : "local";

function runQuery(target, sql = null) {
  const targetArgs =
    target === "linked"
      ? ["--linked"]
      : target === "candidate"
        ? ["--linked", "--workdir", candidateWorkdir]
        : ["--local", "--workdir", localWorkdir];
  const args = [
    "supabase",
    "db",
    "query",
    "--output",
    "json",
    ...(sql === null ? ["--file", sqlFile] : [sql]),
    ...targetArgs,
  ];
  const result = spawnSync("npx", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${target} schema query exited with status ${result.status}`,
    );
  }

  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed.rows)) {
    throw new Error(`${target} schema query did not return a rows array`);
  }

  return parsed.rows;
}

const linked = new Map(runQuery("linked").map((row) => [row.category, row]));
const local = new Map(
  runQuery(comparisonTarget).map((row) => [row.category, row]),
);
const categories = [...new Set([...linked.keys(), ...local.keys()])].sort();
const differences = [];

for (const category of categories) {
  const linkedRow = linked.get(category);
  const localRow = local.get(category);

  if (
    linkedRow?.object_count !== localRow?.object_count ||
    linkedRow?.fingerprint !== localRow?.fingerprint
  ) {
    differences.push({
      category,
      linked_count: linkedRow?.object_count ?? null,
      local_count: localRow?.object_count ?? null,
      linked_fingerprint: linkedRow?.fingerprint ?? null,
      local_fingerprint: localRow?.fingerprint ?? null,
    });
  }
}

if (differences.length > 0) {
  const fingerprintSql = readFileSync(sqlFile, "utf8");
  const aggregateStart = fingerprintSql.lastIndexOf(
    "\nSELECT\n  category,\n  count(*)::integer AS object_count,",
  );

  if (aggregateStart < 0) {
    throw new Error(
      "Could not derive detailed inventory query from fingerprint SQL",
    );
  }

  const inventorySql = `${fingerprintSql.slice(0, aggregateStart)}\nSELECT category, identity, payload\nFROM all_definitions\nORDER BY category, identity, payload;`;
  const linkedRows = runQuery("linked", inventorySql);
  const localRows = runQuery(comparisonTarget, inventorySql);
  const differingCategories = new Set(
    differences.map(({ category }) => category),
  );

  function groupByIdentity(rows, category) {
    const grouped = new Map();

    for (const row of rows) {
      if (row.category !== category) continue;
      const payloads = grouped.get(row.identity) ?? [];
      payloads.push(row.payload);
      grouped.set(row.identity, payloads);
    }

    for (const payloads of grouped.values()) payloads.sort();
    return grouped;
  }

  const inventoryDifferences = {};

  for (const category of [...differingCategories].sort()) {
    const linkedByIdentity = groupByIdentity(linkedRows, category);
    const localByIdentity = groupByIdentity(localRows, category);
    const identities = [
      ...new Set([...linkedByIdentity.keys(), ...localByIdentity.keys()]),
    ].sort();
    const missingLocal = [];
    const extraLocal = [];
    const changed = [];

    for (const identity of identities) {
      const linkedPayloads = linkedByIdentity.get(identity);
      const localPayloads = localByIdentity.get(identity);

      if (!localPayloads) {
        missingLocal.push({ identity, linked_payloads: linkedPayloads });
      } else if (!linkedPayloads) {
        extraLocal.push({ identity, local_payloads: localPayloads });
      } else if (
        JSON.stringify(linkedPayloads) !== JSON.stringify(localPayloads)
      ) {
        changed.push({
          identity,
          linked_payloads: linkedPayloads,
          local_payloads: localPayloads,
        });
      }
    }

    inventoryDifferences[category] = {
      missing_local: missingLocal,
      extra_local: extraLocal,
      changed,
    };
  }

  console.error(
    JSON.stringify(
      {
        status: "different",
        differences,
        inventory_differences: inventoryDifferences,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "match",
      categories: categories.length,
      comparison_target: comparisonTarget === "candidate" ? "hosted" : "local",
      comparison_workdir: candidateWorkdir || localWorkdir,
    },
    null,
    2,
  ),
);
