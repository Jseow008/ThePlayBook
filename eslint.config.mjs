import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-img-element": "error",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
    },
  },
  {
    files: [
      "lib/**/*.{ts,tsx}",
      "app/api/**/*.{ts,tsx}",
      "hooks/**/*.{ts,tsx}",
      "app/api/library/**/*.ts",
      "app/api/feedback/content/route.ts",
      "app/api/activity/log/route.ts",
      "app/api/random/route.ts",
      "app/(public)/browse/page.tsx",
      "hooks/useReaderSettings.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Existing Supabase generated-type/RPC debt. New files stay covered by the
    // stricter rule above, and scripts/check-type-safety-ratchet.mjs blocks
    // growth in the current `as any` baseline.
    files: [
      "app/api/admin/content/*/route.ts",
      "app/api/admin/content/bulk/route.ts",
      "app/api/admin/content/route.ts",
      "app/api/admin/embeddings/sync-segments/route.ts",
      "app/api/admin/embeddings/sync/route.ts",
      "app/api/admin/launch-readiness/route.ts",
      "app/api/chat/route.ts",
      "app/api/content-requests/*/vote/route.ts",
      "app/api/content-requests/route.ts",
      "app/api/notification-preferences/route.ts",
      "lib/server/admin-content-workbench.ts",
      "lib/server/ai-usage-quota.ts",
      "lib/server/content-request-notifications.ts",
      "lib/server/content-requests.ts",
      "lib/server/gemini-segment-sync.ts",
      "lib/server/launch-readiness.ts",
      "lib/server/narration-estimate.ts",
      "lib/server/narration-processor.ts",
      "lib/server/user-library-repository.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
