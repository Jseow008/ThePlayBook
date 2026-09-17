import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("function ACL drift repair", () => {
  const jwtServiceRoleGuard =
    /coalesce\s*\(\s*auth\.jwt\(\)\s*->>\s*'role'\s*,\s*''\s*\)\s*(?:<>|!=)\s*'service_role'/i;

  it("recognizes the deployed JWT service-role guard as one expression", () => {
    const check = readFileSync(
      join(root, "scripts/security-function-acl-check.sql"),
      "utf8",
    );
    const deployedDefinition = `
      BEGIN
        IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
          RAISE EXCEPTION 'insert_generated_content requires service role';
        END IF;
      END;
    `;

    expect(check).toContain("auth.role() <> ''service_role''");
    expect(check).toContain(
      "coalesce\\\\s*\\\\(\\\\s*auth\\\\.jwt\\\\(\\\\)\\\\s*->>\\\\s*''role''",
    );
    expect(jwtServiceRoleGuard.test(deployedDefinition)).toBe(true);
  });

  it("rejects an unrelated comparison elsewhere in a JWT-aware function", () => {
    const definitionWithUnrelatedComparison = `
      BEGIN
        IF auth.jwt() ->> 'role' = 'authenticated' THEN
          PERFORM audit_login();
        END IF;

        IF NEW.status <> 'service_role' THEN
          RAISE EXCEPTION 'invalid status';
        END IF;
      END;
    `;

    expect(jwtServiceRoleGuard.test(definitionWithUnrelatedComparison)).toBe(
      false,
    );
  });

  it("revokes direct API execution of the drifted trigger helper", () => {
    const migration = readFileSync(
      join(
        root,
        "supabase/migrations/20260917130000_repair_function_acl_drift.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("prevent_duplicate_active_book()");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });
});
