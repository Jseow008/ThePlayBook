## UI Guardrails

When working on UI or UX in this repository, preserve the existing Flux design system and treat the current product as the source of truth.

### UI/UX Pro Max Usage Policy

`ui-ux-pro-max` is allowed only as a reference and polish aid. It must not be used as the authoritative design system for Flux.

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
3. Do not use `--design-system` for an existing Flux page unless the user explicitly asks for a redesign exploration.
4. Before editing, state what will remain unchanged.
5. Keep UI edits localized and reversible.
6. Validate visual changes against desktop and mobile behavior.

### Landing Page Default Scope

For the landing page, default to polish-only changes in:
- `components/ui/LandingPage.tsx`
- `app/globals.css`
- `components/ui/AmbientBackground.tsx`

Do not add new sections, move sections, or replace the hero concept unless explicitly requested.
