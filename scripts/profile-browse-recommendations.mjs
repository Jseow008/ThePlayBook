import { runSupabaseSqlCheck } from "./run-supabase-sql-check.mjs";

const useLocal = /^(1|true|yes)$/i.test(process.env.SUPABASE_LOCAL ?? "");
const profileDbUrl = process.env.BROWSE_RECOMMENDATION_PROFILE_DB_URL?.trim();

if (!useLocal && !profileDbUrl) {
  console.error(
    "Refusing to profile a linked database. Set SUPABASE_LOCAL=1 or provide " +
      "BROWSE_RECOMMENDATION_PROFILE_DB_URL for an explicitly chosen profiling database.",
  );
  process.exit(1);
}

if (profileDbUrl) {
  process.env.SUPABASE_DB_URL = profileDbUrl;
} else {
  // Do not let a shell's generic application database URL override the explicit
  // local-only choice above.
  delete process.env.SUPABASE_DB_URL;
  delete process.env.DATABASE_URL;
}

runSupabaseSqlCheck("browse-recommendation-query-profile.sql");
