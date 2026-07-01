# Admin Responsive Patterns

Status: Active

This document defines responsive layout rules for Netflux admin surfaces. It extends the current product implementation and does not replace `docs/DESIGN.md`, `app/globals.css`, or active admin components.

## Scope

Admin pages keep the existing light theme, compact operational tone, and current navigation structure. Responsive changes should preserve the existing workflow order and avoid introducing marketing-style layouts.

Primary sources:

- `app/admin/layout.tsx`
- `app/admin/page.tsx`
- `components/admin/ContentWorkbenchClient.tsx`
- `components/admin/ContentForm.tsx`

## Header And Navigation

- Admin navigation uses wrapping flex rows at mobile and tablet widths.
- At `md` (`768px`), primary nav items may wrap, but they must not produce more than two visual nav lines.
- If future nav growth would exceed two lines at `md`, prefer one of these deliberate changes: shorten labels, hide labels below a larger breakpoint, group secondary destinations, or move lower-frequency destinations behind a menu.
- Do not let header growth create document-level horizontal overflow or cover page controls.

## Lists And Tables

- `xl` (`1280px`) is the canonical threshold for switching admin list views from cards to dense table/comparison layouts.
- Below `xl`, admin list items should render as cards when row-level actions and metadata need to remain fully discoverable.
- At `xl` and above, use tables or grid-table layouts for comparison-heavy data, bulk selection, and repeated row actions.
- When a desktop table needs more width than the viewport, the table container must own horizontal overflow with `overflow-x-auto`; the document must not scroll horizontally.
- Column hiding is acceptable only when the hidden value is non-critical for the current task or is repeated elsewhere in the row/card.

## Filters And Toolbars

- Filter bars should wrap naturally and keep all controls reachable at tablet width.
- Search, filter, sort, saved-view, pagination, and primary creation actions should not depend on hover-only discovery.
- Primary actions such as "New Content" should remain visible and tappable before the list content.

## Forms And Editors

- Form sections should stay single-column on narrow mobile widths and may use two-column grids from `md` when labels, controls, and error text remain readable.
- Dense option groups may stay compact at tablet width, but each option must retain a clear tap target and visible label.
- Long editors should keep submit actions reachable through normal page scrolling; sticky actions are optional, not required.
- Tablet editor smoke tests should verify stable anchors instead of only asserting page load: the title input, at least one content-type option, and a save or publish action.

## Verification

Admin responsive changes should include at least one of:

- component coverage for layout-specific state,
- a Playwright viewport smoke test,
- a focused visual/manual check at mobile, tablet, and desktop widths.

Required browser-level checks for admin responsive work:

- no unintended document-level horizontal overflow,
- primary nav wraps into no more than two nav lines at `md`,
- table overflow is owned by the table container at `xl`,
- filters and primary actions are contained in the viewport,
- editor title/type/action controls are reachable at tablet width.
