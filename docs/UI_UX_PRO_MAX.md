# UI UX Pro Max Integration

UI UX Pro Max is installed in this project as assistant-local tooling, not as an application dependency.

## Flux Rule

For Flux, UI UX Pro Max is a reference library, not the design authority.

The shipped source of truth is:
- `docs/DESIGN.md`
- `app/globals.css`
- existing component structure in `components/ui/`

Do not let UI UX Pro Max:
- replace the project design system
- rewrite the landing page layout
- change font families or typography scale
- change section order or CTA strategy
- introduce a new visual identity without explicit approval

Use it only for:
- UI review
- UX/accessibility checks
- hover/focus/motion refinement
- background and surface polish
- small component-level improvements

## Installed Locations

- Codex: `.codex/skills/ui-ux-pro-max/`
- Antigravity: `.agent/skills/ui-ux-pro-max/`

Each install includes:

- `SKILL.md` for assistant activation/instructions
- `scripts/search.py` for design-system and domain searches
- bundled CSV data files under `data/`

## Current Project Artifacts

- Master design system: `design-system/flux/MASTER.md`
- Landing page override: `design-system/flux/pages/landing.md`

These files are intended as assistant reference material during future UI work.

## Recommended Workflow For Flux

1. Treat `docs/DESIGN.md` and `app/globals.css` as the source of truth for the shipped product.
2. Use UI UX Pro Max for ideation, design reviews, and narrow page-specific exploration only.
3. Read the existing page component before running any UI UX Pro Max command.
4. Prefer domain lookups over design-system generation.
5. Keep changes localized and polish-only unless the user explicitly asks for a redesign.
6. Treat `design-system/flux/MASTER.md` and page overrides as historical reference artifacts, not as source of truth.

## Safe Command Patterns

Prefer these:

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

Avoid this for normal Flux UI work. Use only for explicit redesign exploration.

From the project root:

```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py \
  "knowledge library reading platform dark mode cinematic editorial content-first" \
  --design-system \
  --persist \
  -f markdown \
  -p "Flux" \
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
  -p "Flux" \
  --page "reader" \
  -o "$(pwd)"
```

## Caveat

The upstream skill tends to generate opinionated alternate design systems and generic landing-page patterns. In Flux, that can degrade usability by replacing an already coherent product hierarchy with a template-driven style direction.

For Flux, prefer:
- `--domain react`
- `--domain web`
- `--domain ux`
- `--domain style`

Avoid treating generated design-system output as a direct replacement for the existing Next.js/Tailwind design system.
