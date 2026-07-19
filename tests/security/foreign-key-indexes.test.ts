import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("DB-104 foreign-key indexes", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260719151322_add_missing_foreign_key_indexes.sql",
    ),
    "utf8",
  );
  const databaseCheck = readFileSync(
    join(process.cwd(), "scripts/database-foreign-key-index-check.sql"),
    "utf8",
  );
  const runner = readFileSync(
    join(process.cwd(), "scripts/check-database-foreign-key-indexes.mjs"),
    "utf8",
  );
  const workflow = readFileSync(
    join(process.cwd(), ".github/workflows/security.yml"),
    "utf8",
  );
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };

  const expectedIndexes = [
    "idx_content_reader_daily_user_activity_date",
    "idx_content_request_notifications_user_id",
    "idx_content_requests_published_content_id",
    "idx_content_requests_submitted_by",
    "idx_segment_embedding_gemini_content_item_id",
    "idx_user_highlights_content_item_id",
    "idx_user_highlights_segment_id",
  ];

  it("fails closed if any audited foreign key changed", () => {
    expect(migration).toContain("DB-104 foreign-key preflight failed");
    expect(migration).toContain("content_reader_daily_user_id_fkey");
    expect(migration).toContain("content_request_notifications_user_id_fkey");
    expect(migration).toContain("content_requests_published_content_id_fkey");
    expect(migration).toContain("content_requests_submitted_by_fkey");
    expect(migration).toContain(
      "segment_embedding_gemini_content_item_id_fkey",
    );
    expect(migration).toContain("user_highlights_content_item_id_fkey");
    expect(migration).toContain("user_highlights_segment_id_fkey");
  });

  it("adds exactly the seven reviewed leading indexes", () => {
    expect(migration.match(/CREATE INDEX /g)).toHaveLength(7);
    for (const indexName of expectedIndexes) {
      expect(migration).toContain(`CREATE INDEX ${indexName}`);
      expect(databaseCheck).toContain(indexName);
    }
    expect(migration).toContain("INCLUDE (content_id)");
    expect(migration).toContain("INCLUDE (segment_id)");
    expect(migration).toContain("INCLUDE (id)");
  });

  it("verifies catalog coverage and index-eligible plans in CI", () => {
    expect(databaseCheck).toContain(
      "index_metadata.indkey[0] = constraint_record.conkey[1]",
    );
    expect(databaseCheck).toContain("SET LOCAL enable_seqscan = off");
    expect(databaseCheck).toContain("assert_plan_uses_index");
    expect(packageJson.scripts?.["database:foreign-key-indexes"]).toBe(
      "node scripts/check-database-foreign-key-indexes.mjs",
    );
    expect(workflow).toContain("npm run database:foreign-key-indexes");
    expect(runner).toContain("DB104_TEST_DB_URL");
    expect(runner).toContain(
      "Refusing to run the DB-104 plan check against a linked database",
    );
  });

  it("bounds lock acquisition and index build time", () => {
    expect(migration).toContain("SET lock_timeout = '5s'");
    expect(migration).toContain("SET statement_timeout = '2min'");
    expect(migration).not.toContain("CREATE INDEX CONCURRENTLY");
  });
});
