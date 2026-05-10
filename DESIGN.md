---
name: "Melty's Christmas Lights Studio"
description: "OBS-ready Christmas lights studio with a compact creator-first control surface."
colors:
  graphite-void: "#050505"
  graphite-frame: "#0c0c0e"
  graphite-surface: "#18181b"
  slate-void: "#08090a"
  slate-frame: "#0e1115"
  slate-surface: "#1c1f26"
  preview-void: "#08090c"
  overlay-preview: "#05090f"
  ember-accent: "#f2af0d"
  ember-accent-hover: "#ffc130"
  cobalt-accent: "#1d4267"
  cobalt-accent-hover: "#355c85"
  text-heading: "#e4e4e7"
  text-body: "#d4d4d4"
  text-label: "#a1a1aa"
  text-muted: "#71717a"
  success: "#34d399"
  danger: "#ef4444"
typography:
  title:
    fontFamily: "Aptos, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0.08em"
  body:
    fontFamily: "Aptos, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Aptos, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.22em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "16px"
  shell: "32px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  sidebar-collapsed: "64px"
  sidebar-expanded: "142px"
components:
  button-primary:
    backgroundColor: "{colors.ember-accent}"
    textColor: "{colors.graphite-frame}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.text-heading}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  input-default:
    backgroundColor: "{colors.graphite-frame}"
    textColor: "{colors.text-heading}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "32px"
  status-pill:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.text-label}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  sidebar-nav-active:
    backgroundColor: "{colors.ember-accent}"
    textColor: "{colors.graphite-frame}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "40px"
---

# Design System: Melty's Christmas Lights Studio

## 1. Overview

**Creative North Star: "Broadcast Light Lab"**

The studio should feel like a focused broadcast lab for shaping light, not a generic settings page. The surface is dark, compact, and operational so the overlay remains the visual star. Warm amber and optional cobalt accents behave like instrument lights: rare, directional, and tied to selection, status, and decisive actions.

This is a product tool first. It should make first-time setup clear, keep deep customization organized, and preserve the premium feel of the output without burying advanced controls behind decoration. Personality comes from the Melty mark, motion details, compact typography, and the light-focused preview language, not from novelty holiday styling.

The system explicitly rejects generic SaaS dashboards, sterile admin panels, outdated OBS plugin interfaces, overly cute holiday toy styling, cluttered novelty controls, and visual treatments that make the UI look heavier than the overlay it controls.

**Key Characteristics:**
- Dense but readable control surfaces.
- Dark graphite and slate layers with a single active accent.
- Compact uppercase labels, small numeric fields, and clear live-status affordances.
- Tonal separation over heavy shadows.
- Creator-first workflows: preview, presets, OBS, Streamer.bot, save, export.

## 2. Colors

The palette is a broadcast console palette: graphite instruments, slate panels, warm amber light, optional cobalt technical mode, and cool zinc text.

### Primary
- **Signal Ember**: The default active accent. Use for selected tabs, primary actions, active rails, focus accents, glow, and high-value status.
- **Hot Filament**: The hover and elevated accent. Use only when Signal Ember needs a brighter state.

### Secondary
- **Control Cobalt**: Alternate shell accent for a cooler Streamer.bot-adjacent mode. Use for the same roles as Signal Ember, never mixed casually with amber on the same control surface.
- **Cobalt Lift**: Hover and elevated state for Control Cobalt.

### Neutral
- **Graphite Void**: The deepest page and body background.
- **Graphite Frame**: Sidebar, topbar, dropdown panels, and input bases.
- **Graphite Surface**: Main work surface and quiet secondary button fills.
- **Slate Void / Slate Frame / Slate Surface**: Softer alternate shell theme values for presentation mode.
- **Preview Void**: Miniature layout and shape preview canvas.
- **Overlay Preview**: Live preview iframe background.
- **Zinc Heading**: Primary headings and high-confidence text.
- **Zinc Body**: Normal readable copy.
- **Zinc Label**: Form labels and inactive navigation.
- **Zinc Muted**: Dividers, metadata, scrollbars, and inactive hints.

### Named Rules

**The Instrument Light Rule.** Accent color marks active state, command, focus, or status. It is not page decoration.

**The One Accent Rule.** Amber and cobalt are theme alternatives. Do not use both as competing accents in one studio surface unless the second color is data or external brand color.

**The Preview First Rule.** The control UI stays darker and quieter than the live overlay preview, so the creator keeps attention on the stream output.

## 3. Typography

**Display Font:** Aptos with Segoe UI Variable Text, Segoe UI, system-ui, and sans-serif fallbacks.
**Body Font:** Aptos with Segoe UI Variable Text, Segoe UI, system-ui, and sans-serif fallbacks.
**Label/Mono Font:** Aptos for labels, platform monospace stack for code, ids, numbers, and URLs.

**Character:** The type system is technical, compact, and broadcast-native. It uses small sizes, heavy uppercase labels, and generous tracking to make dense controls scannable without turning the interface into a retro terminal.

### Hierarchy
- **Display** (900, 14-18px, 1.2): Rare. Use for future onboarding or setup summaries, not dense control panels.
- **Headline** (900, 11-12px, 1.2): Page headers, section markers, and support page group labels.
- **Title** (900, 10-12px, 1.2): Panel titles, preset names, and navigation labels.
- **Body** (500-600, 11-12px, 1.55): Descriptions, helper text, messages, and readable inline content.
- **Label** (900, 8-11px, 0.16-0.30em, uppercase): Control labels, status pills, header actions, tab labels, and compact navigation.
- **Mono** (500, 10-11px, 1.45): Numeric slider values, preset ids, URL blocks, and generated code-like values.

### Named Rules

**The Dense Label Rule.** Labels may be small only when they are heavy, tracked, and placed in consistent rows. Tiny weak labels are forbidden.

**The No Hero Type Rule.** This product UI does not use landing-page scale typography inside the studio. Large expressive type belongs to a later brand pass.

## 4. Elevation

The system is flat-by-default and uses tonal layering, borders, active glows, and inset preview shading instead of heavy card shadows. Depth comes from the relationship between graphite frame, graphite surface, translucent panels, 1px borders, and active accent light. Shadows are reserved for glow, focus, and tiny status highlights.

### Shadow Vocabulary
- **Accent Glow** (`box-shadow: 0 0 20px var(--melt-accent-glow)`): Use for selected or emphasized light states only.
- **Active Rail Glow** (`box-shadow: 0 0 16px rgba(255,179,0,0.55)`): Use inside miniature layout controls to show the selected light rail.
- **Micro Frame** (`box-shadow: 0 0 0 1px rgba(255,255,255,0.01)`): Use for subtle image/avatar containment.
- **Focus Ring** (`box-shadow: 0 0 0 3px rgba(227,178,91,0.12)`): Use on focused inputs and selects.

### Named Rules

**The Tonal Depth Rule.** Prefer darker or lighter surface steps, 1px borders, and selected fills before reaching for a shadow.

**The Glow Is State Rule.** Glow must communicate active, selected, live, or focused state. Decorative glow is prohibited.

## 5. Components

### Buttons

Buttons are compact command surfaces, not marketing CTAs.

- **Shape:** Gently squared controls (6px radius) with full-pill used only for header utility buttons.
- **Primary:** Signal Ember fill with Graphite Frame text, 32px height, heavy uppercase label, and 0.18em tracking.
- **Hover / Focus:** Primary brightens to Hot Filament. Secondary buttons shift border and text toward the active accent. Focus must be visible and not rely on color alone.
- **Secondary / Ghost:** Graphite Surface tint, subtle border, Zinc Heading text, and accent-color hover.
- **Danger:** Red tint and border for destructive actions only.

### Chips

Chips are status indicators, not decorative badges.

- **Style:** 9px uppercase text, heavy weight, 0.18em tracking, full pill radius, 1px border.
- **State:** Neutral chips use muted borders and graphite fills. Good chips use emerald. Warn and accent chips use Signal Ember.

### Cards / Containers

Containers are sparse and functional. Avoid card-heavy dashboards.

- **Corner Style:** Most framed controls use 6-8px radius. The app shell uses one large 32px top-left radius to distinguish the workbench from the frame.
- **Background:** Graphite Frame for chrome, Graphite Surface for the workbench, translucent frame fills for control groups.
- **Shadow Strategy:** Use tonal layering and borders. Use shadows only for glow, focus, and micro containment.
- **Border:** Subtle zinc borders at 10-20% opacity.
- **Internal Padding:** Dense controls use 8-12px. Page rhythm uses 16-24px.

### Inputs / Fields

Fields are compact and numeric-first.

- **Style:** 32px height for selects and text inputs, 28px height for small numeric inputs, 6px radius, dark frame fill, subtle muted border.
- **Focus:** Accent border plus a soft 3px focus ring.
- **Disabled:** Lower opacity and preserve layout dimensions.
- **Range Fields:** Three-column row: label, range track, numeric input. The numeric value is always visible for precision.

### Navigation

Navigation behaves like a tool rail.

- **Sidebar:** 64px collapsed, 142px expanded. Icons lead, labels reveal on hover, active selection uses a moving accent rail.
- **Topbar:** Tiny broadcast-style path label, connection status pills, preview visibility, and overlay launch.
- **Motion:** Sidebar expansion and nav text reveal use controlled GSAP timing. Motion should feel mechanical and responsive, not playful bounce.
- **Mobile / Narrow Windows:** Protect control readability and preview visibility. Dense rows may stack only when labels or numeric inputs would collide.

### Live Preview

The live preview is the product's proof surface.

- **Frame:** Right-hand pane with a 1px divider, 36px header, dark preview background, and resizable width.
- **Status:** Live indicator uses emerald and a small glow. The preview should feel active without competing with the overlay.
- **Behavior:** Preview controls should never steal pointer streams during resize. Maintain the existing iframe shield pattern.

### Preset Cards

Preset cards are selectable rows for reusable stream looks.

- **Style:** 8px radius, 1px border, compact 12px uppercase title, 10px mono id.
- **State:** Selected cards use accent border and low alpha accent fill. Unselected cards stay graphite with an accent border hover.
- **Actions:** Apply, export, delete, update, import, and refresh remain explicit commands.

### Social Links

Social links are personality surfaces outside the main studio workflow.

- **Style:** 52px tall, 16px radius, brand-color hover fill, icon enlarges and centers, label slides away.
- **Rule:** This higher-energy behavior belongs on support and creator pages. Do not import it into dense setup controls.

## 6. Do's and Don'ts

### Do:
- **Do** keep the studio a product tool first: fast to understand, dense enough for real control, and calm enough for repeated use.
- **Do** make first-run setup obvious before exposing every deep customization path.
- **Do** use Signal Ember or Control Cobalt for active state, command, focus, and status.
- **Do** preserve numeric precision beside sliders.
- **Do** keep the live preview visible, resizable, and visually quieter than the overlay itself.
- **Do** keep animation short, responsive, and tied to state changes.
- **Do** keep keyboard focus visible on every interactive control.

### Don't:
- **Don't** make this look like a generic SaaS dashboard.
- **Don't** make this feel like a sterile admin panel.
- **Don't** imitate outdated OBS plugin interfaces.
- **Don't** lean into overly cute holiday toy styling.
- **Don't** add cluttered novelty controls.
- **Don't** use visual treatments that make the UI look heavier than the overlay it controls.
- **Don't** sacrifice clarity, performance, or control density for personality.
- **Don't** make advanced users dig through decorative surfaces to reach real settings.
- **Don't** use colored side-stripe borders greater than 1px as card accents.
- **Don't** use gradient text, decorative glassmorphism, or repeated identical card grids.
