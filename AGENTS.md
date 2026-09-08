## UI Guardrails

When working on UI or UX in this repository, preserve the existing Netflux design system and treat the current product as the source of truth.

### UI/UX Pro Max Usage Policy

`ui-ux-pro-max` is allowed only as a reference and polish aid. It must not be used as the authoritative design system for Netflux.

Always preserve:
- Existing layout structure and section order
- Existing font families and typography scale
- Existing spacing rhythm and breakpoint behavior
- Existing copy hierarchy unless the user explicitly asks for copy changes
- Existing product identity from `docs/DESIGN.md` and `app/globals.css`

Allowed uses:
- Background polish
- Hover, focus, and active-state refinement
- Scroll and reveal effects
- Card polish, shadows, borders, and subtle gradients
- Accessibility review
- Interaction and motion review
- Small visual consistency improvements

Disallowed uses unless the user explicitly approves a redesign:
- Full landing-page rewrites
- New design-system generation replacing project tokens
- Typography swaps or oversized editorial display type
- Section reshuffling or conversion-pattern changes
- Rewriting CTA strategy around generic templates
- Applying generated design-system files as source of truth

### Required Workflow For UI Tasks

1. Read `docs/DESIGN.md` and relevant existing components before proposing changes.
2. If using `ui-ux-pro-max`, use it only for narrow lookups such as `--domain ux`, `--domain web`, `--domain style`, or `--domain react`.
3. Do not use `--design-system` for an existing Netflux page unless the user explicitly asks for a redesign exploration.
4. Before editing, state what will remain unchanged.
5. Keep UI edits localized and reversible.
6. Validate visual changes against desktop and mobile behavior.

### Landing Page Default Scope

For the landing page, default to polish-only changes in:
- `components/ui/LandingPage.tsx`
- `app/globals.css`
- `components/ui/AmbientBackground.tsx`

Do not add new sections, move sections, or replace the hero concept unless explicitly requested.

## GitHub Pull Request Workflow

`main` is protected. Publish changes through a pull request; do not push directly to `main`.

For ordinary application, test, documentation, or configuration changes:

1. Start every **independent** change from a freshly fetched `origin/main`, never from the currently checked-out feature branch:
   ```bash
   git fetch origin main
   git switch -c codex/<task> --no-track origin/main
   ```
   An intentionally stacked PR is the only exception. Label it `stacked-pr` and name its parent PR in the PR description.
2. Use a separate Codex-managed worktree for parallel tasks whenever practical. A worktree isolates files, but does not replace the branch and scope checks below.
3. Create a focused branch and commit only the intended files. Before opening a PR—and again before enabling auto-merge—verify that its commits and files match only the stated task:
   ```bash
   git log --oneline origin/main..HEAD
   git diff --name-status origin/main...HEAD
   ```
4. Push the branch and open a ready-for-review pull request. Inspect the rendered PR file list with `gh pr diff --stat` before treating its scope as approved.
5. Enable squash auto-merge with `gh pr merge --auto --squash` only after the `PR scope` check passes and the scope inspection is clean. Let GitHub run the required `validate` and `Security Validation` checks in the background; auto-merge will wait for them.
6. Do not wait for post-merge checks unless the user explicitly asks for deployment monitoring or a required check fails.

Auto-merge does not authorize a production database change. For a new Supabase migration, follow the database-facing production release gate in `docs/OPS.md`, including the reviewed production dry-run and explicit authorization before `db push`. If a migration is already applied and the current change contains application or generated-type updates only, do not reapply the migration or repeat the full database rollout; record that fact in the pull request instead.
