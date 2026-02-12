# DESIGN.md: Flux Design System

> **Theme:** Dark Mode Native. High-contrast, distraction-free, content-focused.  
> **Tech Stack:** Tailwind CSS, Lucide React.  
> **Constraint:** All semantic colors map to CSS variables in `globals.css`.

---

## 1. Core Tokens

### 1.1 Color Palette

| Token | Tailwind Class | Usage |
| --- | --- | --- |
| **Background** | `bg-background` | Main page background (dark) |
| **Surface** | `bg-card` | Cards, sidebar, modals |
| **Border** | `border-border` | Subtle borders |
| **Primary** | `bg-primary` | CTA buttons |
| **Text Primary** | `text-foreground` | Headings, body |
| **Text Muted** | `text-muted-foreground` | Metadata, subtitles |
| **Accent** | `bg-accent` | Hover states, active items |

### 1.2 Typography

* **UI Font:** `Inter` (Variable) — Navigation, buttons, headings
* **Headings:** `Outfit` (Sans-Serif) — Modern, geometric, premium
* **Body:** `Inter` (Sans-Serif) — Clean, legible
* **Prose Font:** `System Serif` / `Georgia` — Deep Mode reading content
* **Weights:** Regular (400), Medium (500), Semibold (600)

### 1.3 Spacing & Radii

* **Radius:** `rounded-lg` (0.5rem) for cards, `rounded-full` for badges
* **Touch Targets:** Minimum 44px on mobile

---

## 2. Layout Patterns

### 2.1 Homepage

**Netflix-Style Header:**
* Fixed position with blur backdrop
* Logo, navigation links, search, user menu

**Hero Carousel:**
* Height: `h-[60vh]` to `h-[70vh]`
* Auto-rotating featured content (5 items max)
* Gradient overlay: `bg-gradient-to-t from-background to-transparent`
* Featured badge, type indicator, CTA button
* Dot indicators for carousel navigation

**Content Lanes:**
* Horizontal scroll with smooth scrolling
* Container: `flex gap-4 overflow-x-auto`
* Hidden scrollbar for clean look
* Category headers with lane title

**Category Sections:**
* Dynamic category-based lanes
* Ordered by: Health, Fitness, Wealth, Finance, Productivity, etc.
* "New on Flux" lane at top

### 2.2 Reader (Desktop)

**3-Column Layout:**
* Left: Segment navigation (`w-72`)
* Center: Content area (`flex-1`, scrollable)
* Right: Actions panel (`w-80`) — Mode toggle, artifacts, share

**Header:**
* Content title, author, duration
* Back to home link
* Progress indicator

### 2.3 Reader (Mobile)

* Single column, document flow
* Collapsible sidebar navigation
* Bottom sheet for segment navigation
* Floating action button for mode toggle

---

## 3. Component Specs

### 3.1 Content Card

Used in lanes and grids.

```
Wrapper: aspect-[3/4] rounded-lg border bg-card relative group
├── Cover Image (or gradient placeholder)
├── Gradient Overlay (bottom fade)
└── Content (absolute bottom)
    ├── Type Badge (podcast/book/article)
    ├── Title (line-clamp-2)
    └── Meta (duration, author)
```

**States:**
* Hover: `scale-105` with transition
* Loading: Skeleton pulse

### 3.2 Hero Carousel Item

```
Wrapper: relative h-[60vh] w-full
├── Background Image (cover, centered)
├── Gradient Overlays (left fade, bottom fade)
└── Content (absolute left, centered vertically)
    ├── Featured Badge
    ├── Type Badge with Icon
    ├── Title (text-5xl, line-clamp-2)
    ├── Description (line-clamp-3)
    ├── Meta Info (author, category)
    └── CTA Buttons (Read, Featured Toggle)
```

### 3.3 Segment Navigation Item

```
Base: flex items-center gap-3 p-3 rounded-md
├── Order number or icon
├── Segment title (truncated)
└── Progress indicator (optional)
```

**States:**
* Inactive: `text-muted-foreground`
* Active: `bg-accent text-foreground font-medium`
* Read: Checkmark icon

### 3.4 Mode Toggle

Toggle between Quick Mode and Deep Mode.

```
Container: flex p-1 bg-muted rounded-full
├── Quick Mode Button
└── Deep Mode Button
```

**States:**
* Active: `bg-primary text-primary-foreground`
* Inactive: `text-muted-foreground hover:text-foreground`

### 3.5 Quick Mode View

* Hook (large, attention-grabbing)
* Big Idea (emphasized)
* Key Takeaways (bullet list)
* CTA: "Read Full Summary" to switch to Deep Mode

### 3.6 Deep Mode View

* Segment-by-segment content
* Markdown rendered with prose styling
* Segment headers as scroll anchors
* Timestamps for audio/video content

### 3.7 Checklist Component

Interactive checklist displayed in reader.

```
Container: bg-card/50 rounded-lg p-4 border
├── Checklist Title (heading)
└── Items List
    └── Item
        ├── Checkbox (interactive)
        ├── Label
        └── Mandatory indicator (optional)
```

**States:**
* Unchecked: Default appearance
* Checked: Strikethrough text, checkmark
* Mandatory: Special badge/indicator

---

## 4. Micro-Interactions

* **Tech:** CSS transitions only (`transition-all duration-200`)
* **Card Hover:** Subtle lift (`-translate-y-1`)
* **Button Press:** Scale down (`scale-95`)
* **Loading:** Skeleton pulses for cards, spinner for actions
* **Carousel:** Auto-rotate every 5 seconds, pause on hover

---

## 5. Responsive Breakpoints

| Breakpoint | Width | Layout |
| --- | --- | --- |
| Mobile | < 768px | Single column, sheets for navigation |
| Tablet | 768px - 1024px | 2-column grid, simplified reader |
| Desktop | > 1024px | Full 3-column reader, 4-card lanes |

---

## 6. Accessibility

* **Focus Ring:** `focus-visible:ring-2 focus-visible:ring-ring`
* **Touch Targets:** 44px minimum
* **Keyboard:** Arrow keys for segment navigation in reader
* **Screen Reader:** Proper headings, alt text, ARIA labels
* **Color Contrast:** WCAG AA compliant

---

## 7. Iconography

* **Library:** Lucide React
* **Stroke:** 1.5px
* **Sizes:**
  * UI (buttons): `size-4` (16px)
  * Navigation: `size-5` (20px)
  * Empty states: `size-12` (48px)

---

## 8. Content Type Badges

Visual differentiation by content type:

| Type | Color | Icon |
| --- | --- | --- |
| Podcast | Purple gradient | `Headphones` |
| Book | Blue gradient | `BookOpen` |
| Article | Green gradient | `FileText` |

---

## 9. Progress Indicators

### On Cards
* Ring around card corner showing % complete
* "Continue" badge for in-progress items

### In Reader
* Progress bar at top of page
* Segment indicators in navigation (read/unread)
* Checklist completion progress

---

## 10. Empty States

### Hero Carousel (No Featured Content)
```
Container: h-[85vh] centered, dark bg with overlay
├── Heading: "Flux" (large, white)
└── Subtext: "A curated library of insights from books, podcasts, and articles. Check back soon for featured content."
```
Note: NO admin button is shown to regular users.

### General Empty States (e.g., empty category)
```
Container: centered, muted
├── Large Icon (size-12, muted)
├── Heading: "No content yet"
└── Subtext: "Check back soon for new summaries"
```

---

## 11. Admin UI

Functional design for admin panel:

* Dark theme (matches public site)
* Form-focused layouts
* Table for content list with pagination
* Drag-and-drop segment reordering
* Artifact editor with add/remove items
* Image upload with preview
* Status badges (draft/verified)
* Featured toggle button
