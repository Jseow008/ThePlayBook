# Netflux Agent Guide

## Execution Efficiency and Continuity

Prioritize effective progress and wall-clock efficiency while preserving required security, authorization, testing, and release gates.

- After 20–30 minutes without resolving a blocker, report what is known and choose a concrete next step. This is a decision checkpoint, not a reason to abandon useful work.
- Test a small, separate development sample before a full benchmark. Never tune against held-out results or rerun until a favorable result appears.
- After two unsuccessful attempts at the same approach, reassess the design before another experiment.
- Reuse evidence only when its relevant inputs and implementation are unchanged. Rerun affected checks or unresolved failures; old model responses cannot validate changed prompts or models.
- Raise product tradeoffs and scope changes early, with options, a recommendation, and user-visible consequences. Continue independent authorized work while necessary decisions are pending.
- Before handoff, pause, or context limits, update the task's existing tracked status document with branch/worktree, commit, completed evidence, failed attempts, blockers, pending decisions, and exact next action. Never include secrets. On resumption, read the checkpoint and verify current state instead of restarting.

## UI and Design

Use the current product, [design guide](docs/DESIGN.md), and [CSS tokens](app/globals.css) as the source of truth. Read the guide and relevant components before proposing UI changes.

Preserve layout and section order, fonts and typography scale, spacing and breakpoints, and product identity. Preserve copy hierarchy unless the user requests copy changes. Redesigns—including new design systems, typography swaps, section reshuffling, or CTA strategy changes—require explicit user approval.

Use `ui-ux-pro-max` only for narrow reference and polish: backgrounds, borders/shadows/gradients, interaction states, motion, accessibility, and consistency. Use `--domain ux`, `web`, `style`, or `react`; never apply generated design systems as project authority. Use `--design-system` only for an explicitly requested redesign exploration.

Before editing, state what remains unchanged. Keep edits localized and reversible, and validate desktop and mobile behavior.

Landing-page work defaults to polish in `components/ui/LandingPage.tsx`, `app/globals.css`, and `components/ui/AmbientBackground.tsx`. Adding or moving sections, rewriting the landing page, or replacing the hero requires an explicit request.

## Pull Requests and Production

`main` is protected: publish through pull requests, never push directly to it.

1. Start each independent change from freshly fetched `origin/main`, using a `codex/<task>` branch, not an existing feature branch. Intentionally stacked PRs must have the `stacked-pr` label and name their parent PR.
2. Use separate Codex-managed worktrees for parallel tasks when practical; isolation does not replace scope checks.
3. Commit only intended files. Before opening a PR and again before enabling auto-merge, inspect `git log --oneline origin/main..HEAD` and `git diff --name-status origin/main...HEAD`.
4. Push and open a ready-for-review PR. Verify its GitHub file list with `gh pr diff <number> --name-only`; use `git diff --stat origin/main...HEAD` for local summary statistics.
5. After `PR scope` passes and scope inspection is clean, enable squash auto-merge with `gh pr merge <number> --auto --squash`. Required `validate` and `Security Validation` checks run in the background and gate merging.
6. Do not wait for post-merge checks unless deployment monitoring was requested or a required check fails.

Auto-merge does not authorize production database changes. Follow the [database-facing release gate](docs/OPS.md#22-disposable-hosted-database-verification), including the reviewed production dry-run and explicit authorization before `db push`. For application/type updates whose migration is already applied, record that fact in the PR; do not reapply it or repeat the full database rollout.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
