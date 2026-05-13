# Netflux Brand Guidelines

This document serves as the absolute, platform-agnostic source of truth for the **Netflux** brand identity. Whether you are developing the Web App, building Mobile Applications (iOS/Android), designing Social Media posts (Canva/Figma), or creating presentation decks, **these rules must be strictly followed to ensure a consistent, premium user experience.**

For Web-specific React and Next.js Tailwind implementations, refer to [DESIGN.md](./DESIGN.md).  
For messaging, audience, and positioning strategy, refer to [POSITIONING.md](./POSITIONING.md).

---

## 1. Brand Concept & Voice

- **Identity:** A knowledge system for non-fiction ideas across books, podcasts, articles, and videos.
- **Tagline:** Learn once. Remember everything.
- **Voice:** Authoritative, clear, minimal, and actionable. We don't speak in buzzwords; we provide pure signal.
- **Aesthetic Vibe:** "Cinematic Dark Mode", Premium, Uncluttered, Focused.

---

## 2. Core Colors (Cross-Platform)

Netflux relies on an ultra-minimal, high-contrast dark palette. We do this to reduce eye strain and focus the user's attention purely on the content being consumed.

| Role | Color Name | Hex Code | HSL Approx | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **App Background** | Pure Void | `#09090B` | 240 10% 4% | The universal background for web/mobile shells, and social media canvas backgrounds. |
| **Primary Text** | Paper White | `#FAFAFA` | 0 0% 98% | High-contrast body text and headings. |
| **Muted Text / Icons**| Zinc Subtitle | `#A1A1AA` | 240 5% 65% | Auxiliary text, timestamps, subtitles, and secondary icons. |
| **Surface/Card** | Elevated Dark | `#111113` | 240 10% 6% | Backgrounds for floating cards, modals, or overlapping sheets. |
| **Borders** | Subtle Outline | `#27272A` | 240 4% 16% | Dividers, subtle borders between list items. |

### Accent Color Family: "Solar Gold"

While the app remains largely monochrome to let the content shine, **Solar Gold** is our official brand accent used for primary Call-To-Action buttons, critical highlights, and app notification badges. It consists of a scaled family to provide flexibility for hover states and subtle backgrounds:

| Shade Name | Hex Code | Primary Usage |
| :--- | :--- | :--- |
| **Solar Gold 50** | `#FFFBEB` | Lightest subtle highlight for text on dark |
| **Solar Gold 100** | `#FEF3C7` | - |
| **Solar Gold 200** | `#FDE68A` | - |
| **Solar Gold 300** | `#FCD34D` | - |
| **Solar Gold 400** | `#FBBF24` | Bright borders or outline emphasis |
| **Solar Gold 500** | `#F59E0B` | **Primary Brand Pop** (Default buttons & CTAs) |
| **Solar Gold 600** | `#D97706` | Hover states for primary buttons |
| **Solar Gold 700** | `#B45309` | Active (pressed) states |
| **Solar Gold 800** | `#92400E` | - |
| **Solar Gold 900** | `#78350F` | Subtle "tinted" background behind gold text |

> **IMPORTANT:** When building for iOS/Android or designing social media assets, avoid purely saturated or vibrant "stock" colors for backgrounds. Stick strictly to this dark minimal palette to retain the cinematic feel. Use Solar Gold sparingly where attention *must* be drawn.

---

## 3. Typography

Netflux utilizes three highly specific typefaces to establish its premium brand identity. 
*(All fonts are available freely via Google Fonts).*

### A. Brand Logo & Display: `Outfit`
Used exclusively for the logo, ultra-large hero titles, marketing landing pages, or high-impact brand statements on social media.
- **Weight:** Medium (500) to Semi-Bold (600)
- **Tracking:** Slightly tight (`-0.025em`)

### B. Core UI & General Headings: `Inter`
The workhorse font for 90% of the interface (buttons, menus, navigation, metadata, standard paragraphs).
- **Weight:** Regular (400) for standard UI text, Semibold (600) for UI headings
- **Characteristics:** Unstyled, raw, extremely readable at small sizes.

### C. Reading & Editorial Content: `Playfair Display`
The premium serif font used during the true deep reading / content consumption experience.
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
- **Stroke Weight:** Mandate a strict **1.5px stroke width** across the entire digital ecosystem (web apps, mobile apps, marketing). Mixing icon weights destroys the premium execution of minimal design. 
- **Imagery Art Direction:** Because Netflux operates on an ultra-dark canvas, raw photography or bright graphics can look harsh. All major images (like book covers or hero banners) should be treated with a subtle dark vignette or a linear gradient fade at the bottom. This ensures images sit smoothly within the void background rather than looking like cut-and-paste stickers.

---

## 8. Social Media "Magazine" Style

For Canva, Figma, and marketing posts, avoid generic "tech startup" vector graphics. Instead, lean into editorial publication design:
- **Typography:** Heavily utilize the `Playfair Display` serif font for pull-quotes, book titles, and large text to mimic high-end literature.
- **Negative Space:** Use massive amounts of negative (empty) space around the text. Do not fill the frame. The luxury feel comes from the restraint.
