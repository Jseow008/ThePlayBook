# UI UX Pro Max Integration

UI UX Pro Max is optional assistant-local tooling, not an application dependency. A repository checkout does not guarantee that the skill or generated design artifacts are present.

## Netflux Rule

For Netflux, UI UX Pro Max is a reference library, not the design authority.

[AGENTS.md](../AGENTS.md) owns the permitted scope and required workflow for UI work. [DESIGN.md](./DESIGN.md) documents the shipped design and its precedence rules: existing CSS and components govern the web product. This guide supplies local-tool examples, not a second design policy.

## Possible Local Install Locations

- Codex: `.codex/skills/ui-ux-pro-max/`
- Antigravity: `.agent/skills/ui-ux-pro-max/`

These paths are ignored assistant-local directories, not tracked application assets. Inspect the active environment's skill location before using an example; if it is absent, follow the repository's UI workflow without this optional tool. A typical install includes:

- `SKILL.md` for assistant activation/instructions
- `scripts/search.py` for design-system and domain searches
- bundled CSV data files under `data/`

## Optional Generated Artifacts

- Possible generated master: `design-system/netflux/MASTER.md`
- Possible generated landing exploration: `design-system/netflux/pages/landing.md`

These paths are not tracked in the current checkout. If a local exploration has created them, treat them as historical reference material only; do not assume they exist or use them as product authority.

## Recommended Workflow For Netflux

1. Follow the UI workflow in `AGENTS.md`, including reading `docs/DESIGN.md` and the relevant existing components.
2. If the skill is available, read its local instructions and use a narrow domain lookup for the specific review or polish task.
3. Validate any resulting changes as required by `AGENTS.md`; a generated recommendation does not authorize a redesign.

## Safe Command Patterns

Use these only if `.codex/skills/ui-ux-pro-max/scripts/search.py` exists. Otherwise substitute the verified local install path; do not assume another checkout has it.

```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "landing page hover focus states dark mode" --domain ux
```

```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "content platform dark mode subtle gradients" --domain style
```

```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "keyboard focus contrast aria semantic layout" --domain web
```

```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "nextjs landing page rendering motion performance" --domain react
```

Use `--design-system` only when the user explicitly wants redesign exploration, and treat the output as inspiration rather than implementation instructions.

## Regenerate Or Extend The Design System

Avoid this for normal Netflux UI work. Use only for explicit redesign exploration.

Only after an explicit redesign-exploration request, and with the local script path verified, the following example writes optional reference artifacts from the project root:

```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py \
  "knowledge library reading platform dark mode cinematic editorial content-first" \
  --design-system \
  --persist \
  -f markdown \
  -p "Netflux" \
  --page "landing" \
  -o "$(pwd)"
```

Example for another page override:

```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py \
  "reader view focused reading long-form annotations dark mode" \
  --design-system \
  --persist \
  -f markdown \
  -p "Netflux" \
  --page "reader" \
  -o "$(pwd)"
```

## Caveat

The upstream skill tends to generate opinionated alternate design systems and generic landing-page patterns. In Netflux, that can degrade usability by replacing an already coherent product hierarchy with a template-driven style direction.

For Netflux, prefer:
- `--domain react`
- `--domain web`
- `--domain ux`
- `--domain style`

Avoid treating generated design-system output as a direct replacement for the existing Next.js/Tailwind design system.
