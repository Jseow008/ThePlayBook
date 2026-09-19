# Netflux Brand Guidelines

This document owns Netflux's visual identity and provides direction for new native apps, social assets, and presentation decks. It does not override the shipped web app's tokens, themes, component styles, or interaction patterns.

For the shipped web app, follow [DESIGN.md](./DESIGN.md), `app/globals.css`, and the existing components. Preserve the light admin shell, reader theme choices, and surface-specific accents.
For messaging, audience, and positioning strategy, refer to [POSITIONING.md](./POSITIONING.md).

---

## 1. Brand Concept & Voice

- **Identity, consumer line, and product promises:** Use the wording and claim-status boundaries in [POSITIONING.md](./POSITIONING.md).
- **Voice:** Authoritative, clear, minimal, and actionable. We don't speak in buzzwords; we provide pure signal.
- **Aesthetic Vibe:** "Cinematic Dark Mode", Premium, Uncluttered, Focused.

---

## 2. Palette Direction for Native and Brand Assets

Use a restrained dark palette for new brand assets. The values below are art-direction references, not replacement web tokens. Web surfaces use semantic variables and their existing theme overrides; the web primary token is not a universal gold CTA.

| Role | Color Name | Hex Code | HSL Approx | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Brand Background** | Pure Void | `#09090B` | 240 10% 4% | Default dark canvas for native concepts and social assets. |
| **Primary Text** | Paper White | `#FAFAFA` | 0 0% 98% | High-contrast body text and headings. |
| **Muted Text / Icons**| Zinc Subtitle | `#A1A1AA` | 240 5% 65% | Auxiliary text, timestamps, subtitles, and secondary icons. |
| **Surface/Card** | Elevated Dark | `#111113` | 240 10% 6% | Backgrounds for floating cards, modals, or overlapping sheets. |
| **Borders** | Subtle Outline | `#27272A` | 240 4% 16% | Dividers, subtle borders between list items. |

### Accent Color Family: "Solar Gold"

**Solar Gold** is a brand accent for selective emphasis. In native concepts and brand assets, the family supports accent buttons, hover states, and subtle backgrounds. For web buttons, highlights, and badges, preserve each existing component's semantic color choices.

| Shade Name | Hex Code | Primary Usage |
| :--- | :--- | :--- |
| **Solar Gold 50** | `#FFFBEB` | Lightest subtle highlight for text on dark |
| **Solar Gold 100** | `#FEF3C7` | - |
| **Solar Gold 200** | `#FDE68A` | - |
| **Solar Gold 300** | `#FCD34D` | - |
| **Solar Gold 400** | `#FBBF24` | Bright borders or outline emphasis |
| **Solar Gold 500** | `#F59E0B` | Main accent when an accent treatment is appropriate |
| **Solar Gold 600** | `#D97706` | Hover states for primary buttons |
| **Solar Gold 700** | `#B45309` | Active (pressed) states |
| **Solar Gold 800** | `#92400E` | - |
| **Solar Gold 900** | `#78350F` | Subtle "tinted" background behind gold text |

> **IMPORTANT:** When building for iOS/Android or designing social media assets, avoid purely saturated or vibrant "stock" colors for backgrounds. Stick strictly to this dark minimal palette to retain the cinematic feel. Use Solar Gold sparingly where attention *must* be drawn.

---

## 3. Typography

These three typefaces guide native concepts and brand assets; web font usage is documented in [DESIGN.md](./DESIGN.md).
*(All fonts are available freely via Google Fonts).*

The web landing page additionally uses `Instrument Serif` only for its hero headline. This is a scoped marketing exception, not a replacement for the core typography system.

### A. Brand Logo & Display: `Outfit`
Use for the logo and selected display statements in new brand assets. This does not authorize applying Outfit to existing web headings or the landing hero.
- **Weight:** Medium (500) to Semi-Bold (600)
- **Tracking:** Slightly tight (`-0.025em`)

### B. Core UI & General Headings: `Inter`
The primary font for UI text in new native concepts: buttons, menus, navigation, metadata, and standard paragraphs.
- **Weight:** Regular (400) for standard UI text, Semibold (600) for UI headings
- **Characteristics:** Unstyled, raw, extremely readable at small sizes.

### C. Reading & Editorial Content: `Playfair Display`
Use for editorial display and pull-quotes in brand assets. Preserve the web reader's supported font choices rather than prescribing one reading font.
- **Weight:** Regular (400) or occasionally Italicized.
- **Characteristics:** Creates a "book-like" premium reading feel. Use carefully; it should not be used for UI buttons or navigation.

---

## 4. Logo Usage

- **Primary Asset:** Reference the primary Netflux brand files. Web usage should prefer `netflux-logo.png` for the wordmark and `netflux-icon-white.png` / `netflux-icon-black.png` for standalone icon usage.
- **Minimum Clear Space:** Allow at least 1/2 of the logo's height of empty space around the logo on all sides to allow it to breathe.
- **Contrast / Backdrop:** The logo should almost always sit on the `#09090B` background. Avoid placing the logo over busy images without a heavy dark gradient fade behind it.

---

## 5. UI Spacing & Geometry

When translating the design to native mobile apps or other platforms:
- **Corners / Border Radius:** Subtle. Use `8px` (`0.5rem`) as the default rounding for cards and text inputs. Avoid heavily rounded, pill-shaped elements unless specifically mapping to a native iOS component pattern (like segmented controls).
- **Rhythm:** Use an `8px` grid system. Padding should generally be increments of `8`, `16`, `24`, `32`.
- **Shadows:** On dark mode, shadows are less visible. Rely on subtle borders (`#27272A`) to separate overlapping black elements rather than heavy drop-shadows.

---

## 6. Motion & Animation

- **Philosophy:** Motion should be functional and restrained, never decorative.
- **Pattern:** Use subtle fade-ins (150-300ms) and slight vertical floating translates (`transform: translateY(-2px)`) for hover states or new screen loads. Avoid bouncy or springy animations that break the serious, cinematic vibe.

---

## 7. Iconography & Artwork

- **Icon Family:** Consistently use outline-style icons. (e.g., `Lucide Outline`).
- **Stroke Weight:** Prefer a consistent **1.5px stroke width** within new native or marketing icon sets. Existing web components retain their current icon family and weight; do not restyle them from this guide.
- **Imagery Art Direction:** Because Netflux operates on an ultra-dark canvas, raw photography or bright graphics can look harsh. All major images (like book covers or hero banners) should be treated with a subtle dark vignette or a linear gradient fade at the bottom. This ensures images sit smoothly within the void background rather than looking like cut-and-paste stickers.

---

## 8. Social Media "Magazine" Style

For Canva, Figma, and marketing posts, avoid generic "tech startup" vector graphics. Instead, lean into editorial publication design:
- **Typography:** Heavily utilize the `Playfair Display` serif font for pull-quotes, book titles, and large text to mimic high-end literature.
- **Negative Space:** Use massive amounts of negative (empty) space around the text. Do not fill the frame. The luxury feel comes from the restraint.
