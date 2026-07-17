import { runSupabaseSqlCheck } from "./run-supabase-sql-check.mjs";

const useLocal = /^(1|true|yes)$/i.test(process.env.SUPABASE_LOCAL ?? "");
const disposableDbUrl = process.env.DB_GEMINI_VECTOR_TEST_DB_URL?.trim();

if (!useLocal && !disposableDbUrl) {
  console.error(
    "Refusing to run the Gemini vector mutation test against a linked database. " +
      "Set SUPABASE_LOCAL=1 or provide DB_GEMINI_VECTOR_TEST_DB_URL for an explicitly disposable database.",
  );
  process.exit(1);
}

if (disposableDbUrl) {
  process.env.SUPABASE_DB_URL = disposableDbUrl;
}

runSupabaseSqlCheck("database-gemini-vector-index-check.sql");

