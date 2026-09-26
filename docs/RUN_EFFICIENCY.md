# Run efficiency and lessons

Purpose: complete authorized work with less repeated context, coordination, and experimentation. Follow [AGENTS.md](../AGENTS.md) for time-boxing, checkpoints, and release rules. This guide adds no approval gate and never relaxes security or acceptance requirements.

## Choose the smallest useful team

- Default to one implementing agent. Add a bounded independent review when risk or the user's request warrants it; a reviewer is not mandatory for every small edit.
- Delegate only a concrete independent task while the coordinator has useful work to do. State the deliverable, owned files, evidence needed, and stopping condition. Do not duplicate the same investigation across agents.
- Prefer a fresh-context agent with a concise brief, relevant paths/commit, constraints, and known findings. Full conversation forks require a specific need for that history. Include applicable authorization and repository instructions.
- Normally use at most two working agents at once, including the coordinator. Expand only for clearly separable work whose likely time saving exceeds coordination cost; briefly state why. This is a default, not a new user-permission requirement.
- Ask for actionable findings and short summaries with artifact references. Reuse a reviewer for focused correction checks; do not restart a full review after every small fix. End or interrupt obsolete assignments.

## Keep evidence and tool output bounded

- Read the existing checkpoint and inspect current state before resuming. Recover committed work from Git if a temporary worktree disappeared; do not recreate completed implementation from scratch.
- Search first, then read relevant sections. Keep raw logs, model responses, and benchmark records in artifacts; inspect summaries and failed cases before loading entire outputs. Never put secrets in checkpoints.
- Run the smallest meaningful development check first, then the required suite for a credible candidate. Record what changed and which evidence must be rerun. Reuse unaffected evidence only under the validity rules in AGENTS.md; do not weaken frozen thresholds or tune against held-out results.
- Wait on completion events or bounded status checks. Avoid repeated unchanged polling and agent-message loops. Database backups and CI waiting are not reasons to keep issuing model calls.

## Learn without accumulating bureaucracy

After a materially expensive or unexpectedly slow run, update this file only if it teaches a reusable lesson. Use: **observed problem → evidence → changed practice → how to check improvement**. Merge duplicates into existing guidance; remove superseded advice. Keep detailed run history in the task's existing status document, not here. Routine successful edits need no retrospective.

Report elapsed time, agent count, repeated experiments, and observed usage when available. Distinguish Codex usage from application-provider benchmark tokens. Do not sum overlapping session counters, count cached tokens as unique work, or infer billed allowance from raw counters. Mark unavailable measurements as unknown. Record what a reviewer actually caught and whether parallel work reduced elapsed time or prevented rework. A large subagent token share is a signal to investigate, not proof of waste or value. Do not call delegation efficient without supporting evidence; narrow or omit future discretionary reviews when their observed benefit does not justify their cost. Check whether later comparable runs improve before claiming savings.

## Lessons recorded 26 September 2026

- **Coordination overhead:** extended retrieval-session records contain hundreds of execution and agent-coordination calls, with large cumulative cached-input usage. These are not isolated per-task billing measurements. Use smaller teams and fresh-context briefs; assess subsequent runs by wall time, coordination calls, and rework.
- **Repeated model experiments:** the held retrieval checkpoint records multiple selector/answer trials; one selector execution used 168 provider calls. Apply the existing two-attempt reassessment rule and resolve response-design tradeoffs before another full benchmark. Compare experiment counts without changing acceptance standards.
- **Misleading cost attribution:** database waiting, Codex context processing, and external model evaluation are different costs. Report them separately; do not blame backups without evidence or reduce required recovery checks to save model tokens.

## Next retrieval implementation: bounded trial

For the structured-evidence response change, the primary agent implements directly with no parallel implementation agents. Use one bounded independent reviewer after the candidate is ready, supplying the diff, acceptance requirements, and relevant evidence rather than the full conversation. Use focused development checks, then the affected release evaluation; repeat only when a change, failure, or unresolved concern requires it.

At handoff, record elapsed time, available agent usage, repeated checks, and actionable reviewer findings in the existing retrieval checkpoint. Unavailable usage remains unknown. The user reports that earlier subagents consumed more than half of the tokens; no measured net efficiency benefit has been established. This trial tests an improvement rather than claiming one. After the trial, replace this section with its evidence-backed lesson; it is not a permanent mandate to spawn a reviewer for every task.
