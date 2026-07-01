# Type-Safety Ratchet

This project keeps TypeScript strict mode enabled and treats new production `any` usage as debt.

## Current Policy

- `@typescript-eslint/no-explicit-any` is enforced for new files in `lib/`, `app/api/`, and `hooks/`.
- Existing Supabase generated-type and RPC gaps are bounded in `eslint.config.mjs`.
- `scripts/check-type-safety-ratchet.mjs` blocks new production files from introducing `as any`, blocks `@ts-ignore`, and fails if the `@ts-expect-error` baseline grows.
- Tests remain exempt from the production `any` rule.

## Known Coverage Limits

The ratchet currently tracks explicit TypeScript escape hatches. It does not catch schema-level permissiveness such as `z.any()` in Zod schemas.

Use `z.unknown()` when the downstream code narrows the value. Keep `z.any()` only for unstable external payloads where the app must accept multiple provider-owned shapes, such as AI SDK message parts.

`app/admin/**` and `components/**` are not yet fully covered by the ESLint `no-explicit-any` rule. Existing `as any` usage in those areas is still bounded by `scripts/check-type-safety-ratchet.mjs`, which blocks new files and count growth. The next closure phase is to clean or explicitly allowlist current admin/component casts, then expand `@typescript-eslint/no-explicit-any` to `app/admin/**/*` and selected `components/**/*`.

## Supabase Types

Regenerate database types after schema changes:

```bash
npm run supabase:types
```

For local Supabase development:

```bash
npm run supabase:types:local
```

After regenerating [types/database.ts](/Users/j/Desktop/Lifebook/types/database.ts), remove any casts or `@ts-expect-error` directives that are no longer needed, then shrink the allowlists in `eslint.config.mjs` and `scripts/check-type-safety-ratchet.mjs`.

## Image Rule

`@next/next/no-img-element` is enabled for production code. Raw `<img>` is allowed only when behavior requires it, such as Satori OG image markup or admin URL previews that rely on direct `onError` fallback handling.
