import { runSupabaseSqlCheck } from "./run-supabase-sql-check.mjs";

if (!/^(1|true|yes)$/i.test(process.env.SUPABASE_LOCAL ?? "")) {
  console.error("DB-107 only runs against the disposable local Supabase database.");
  process.exit(1);
}

runSupabaseSqlCheck("database-account-data-snapshot-check.sql");
