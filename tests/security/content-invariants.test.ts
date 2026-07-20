import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("DB-105 core content invariants", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260720145630_enforce_core_content_invariants.sql",
    ),
    "utf8",
  );
  const databaseCheck = readFileSync(
    join(process.cwd(), "scripts/database-content-invariants-check.sql"),
    "utf8",
  );
  const runner = readFileSync(
    join(process.cwd(), "scripts/check-database-content-invariants.mjs"),
    "utf8",
  );
  const workflow = readFileSync(
    join(process.cwd(), ".github/workflows/security.yml"),
    "utf8",
  );
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };

  const expectedConstraints = [
    "content_item_title_contract_check",
    "content_item_duration_positive_check",
    "content_item_category_shape_check",
    "content_item_quick_mode_shape_check",
    "content_item_series_assignment_check",
    "content_item_verified_published_at_check",
    "segment_timing_pair_check",
    "content_series_title_contract_check",
    "content_series_slug_contract_check",
    "content_series_description_length_check",
  ];

  it("fails closed when production data or constraint names do not match the audit", () => {
    expect(migration).toContain("DB-105 preflight found existing constraint names");
    expect(migration).toContain("DB-105 production-data preflight failed");

    for (const constraintName of expectedConstraints) {
      expect(migration).toContain(constraintName);
      expect(databaseCheck).toContain(constraintName);
    }
  });

  it("adds and validates exactly the ten reviewed check constraints", () => {
    expect(migration.match(/ADD CONSTRAINT /g)).toHaveLength(10);
    expect(migration.match(/NOT VALID;/g)).toHaveLength(10);
    expect(migration.match(/VALIDATE CONSTRAINT /g)).toHaveLength(10);
    expect(migration).toContain("SET lock_timeout = '5s'");
    expect(migration).toContain("SET statement_timeout = '2min'");
  });

  it("covers direct-write failures and retained compatibility cases", () => {
    expect(databaseCheck).toContain("assert_check_violation");
    expect(databaseCheck).toContain("Zero-based ordering remains compatible");
    expect(databaseCheck).toContain("empty quick-mode draft");
    expect(databaseCheck).toContain("partial segment timing pair");
    expect(databaseCheck).toContain("verified content without published_at");
  });

  it("runs in required CI and refuses linked production mutation tests", () => {
    expect(packageJson.scripts?.["database:content-invariants"]).toBe(
      "node scripts/check-database-content-invariants.mjs",
    );
    expect(workflow).toContain("npm run database:content-invariants");
    expect(runner).toContain("DB105_TEST_DB_URL");
    expect(runner).toContain(
      "Refusing to run the DB-105 invariant check against a linked database",
    );
  });
});
