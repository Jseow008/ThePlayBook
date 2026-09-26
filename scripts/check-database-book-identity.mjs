import { runSupabaseSqlCheck } from "./run-supabase-sql-check.mjs";

const disposableUrl = process.env.BOOK_IDENTITY_TEST_DB_URL?.trim();
if (!disposableUrl && process.env.SUPABASE_LOCAL !== "1") {
  console.error("Book identity fixtures require an explicitly disposable database.");
  process.exit(1);
}
if (disposableUrl) {
  process.env.SUPABASE_DB_URL = disposableUrl;
} else {
  // Local mode must not inherit a remote connection from the shell.
  delete process.env.SUPABASE_DB_URL;
  delete process.env.DATABASE_URL;
}
runSupabaseSqlCheck("database-book-identity-check.sql");
